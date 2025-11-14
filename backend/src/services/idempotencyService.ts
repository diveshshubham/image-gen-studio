import logger from '../utils/logger';
import {
  initDb,
  getIdempotency,
  createIdempotency,
  markIdempotencyDone,
  markIdempotencyFailed,
  get,
  run,
} from '../models/db';
import { createGenerationService, ModelOverloadError, GenerationResult } from './generationService';

/**
 * Create generation with idempotency orchestration.
 *
 * Returns an object { code, body } which the controller can directly use
 * to send the HTTP response.
 *
 * Option B behaviour:
 *  - If an existing idempotency record has status === 'failed', do NOT reprocess;
 *    instead return 409 Conflict with an instruction to use a new idempotency key.
 */
export async function createGenerationWithIdempotency(
  userId: number,
  prompt: string,
  style: string,
  file: Express.Multer.File | undefined,
  idempotencyKey?: string
): Promise<{ code: number; body: any }> {
  logger.debug(`createGenerationWithIdempotency called for user=${userId} key=${idempotencyKey}`);
  // Enforce idempotency key presence here
  if (!idempotencyKey) {
    logger.warn(`createGeneration missing idempotency key for user=${userId}`);
    return { code: 400, body: { message: 'Missing idempotency key' } };
  }

  try {
    await initDb();

    // check existing idempotency record
    const existing = getIdempotency(idempotencyKey);
    if (existing) {
      if (existing.status === 'done' && existing.generationId) {
        const genRow = get(
          'SELECT id, userId, prompt, style, imageUrl, status, createdAt FROM generations WHERE id = ?',
          [existing.generationId]
        );
        logger.info(`Idempotent hit for key=${idempotencyKey} user=${userId} -> returning existing generation ${existing.generationId}`);
        return { code: 200, body: { idempotent: true, generation: genRow } };
      }
      if (existing.status === 'in-progress') {
        logger.info(`Generation already in progress for key=${idempotencyKey} user=${userId}`);
        return { code: 202, body: { message: 'Generation in progress' } };
      }
      // NEW Option B behaviour:
      // If prior attempt failed, refuse automatic reprocessing and tell client to use new idempotency key.
      if (existing.status === 'failed') {
        logger.info(`Previous generation attempt failed for key=${idempotencyKey} user=${userId} — refusing automatic reprocess`);
        return {
          code: 409,
          body: {
            message: 'Previous attempt failed for this idempotency key. Use a new idempotency key to retry.',
          },
        };
      }
      // any other unexpected status: allow reprocessing (fall through)
    }

    // create in-progress idempotency marker (may throw if duplicate key inserted concurrently)
    try {
      createIdempotency(idempotencyKey, userId || null);
    } catch (e) {
      logger.warn(`createIdempotency race or error for key=${idempotencyKey} user=${userId}`, { err: e });
      // if createIdempotency failed due to race (key inserted), re-check
      const re = getIdempotency(idempotencyKey);
      if (re && re.status === 'in-progress') {
        logger.info(`Race detected and another process is in-progress for key=${idempotencyKey}`);
        return { code: 202, body: { message: 'Generation in progress' } };
      }
      if (re && re.status === 'done' && re.generationId) {
        const genRow = get(
          'SELECT id, userId, prompt, style, imageUrl, status, createdAt FROM generations WHERE id = ?',
          [re.generationId]
        );
        return { code: 200, body: { idempotent: true, generation: genRow } };
      }

      // If re.status === 'failed' and we've chosen Option B earlier, refuse.
      if (re && re.status === 'failed') {
        logger.info(`Race detected but prior attempt already failed for key=${idempotencyKey}; refusing to reprocess`);
        return {
          code: 409,
          body: {
            message: 'Previous attempt failed for this idempotency key. Use a new idempotency key to retry.',
          },
        };
      }
    }

    // perform generation work WITHOUT inserting into DB
    let generationPartial: GenerationResult;
    try {
      generationPartial = await createGenerationService(userId, prompt, style, file, { skipInsert: true });
    } catch (err: any) {
      // mark idempotency failed where appropriate
      try {
        markIdempotencyFailed(idempotencyKey);
      } catch (_) {
        // ignore mark failure
      }

      if (err instanceof ModelOverloadError || err.name === 'ModelOverloadError') {
        logger.warn(`Model overloaded for user=${userId}: ${err.message}`);
        return { code: 503, body: { message: 'Model overloaded' } };
      }
      logger.error(`createGenerationService error for user=${userId}: ${err.stack || err}`);
      return { code: 500, body: { message: 'Server error' } };
    }

    // persist the generation into the DB and get inserted id
    try {
      run(
        'INSERT INTO generations (userId, prompt, style, imageUrl, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, generationPartial.prompt, generationPartial.style, generationPartial.imageUrl, generationPartial.status, generationPartial.createdAt]
      );
      const last = get<{ id: number }>('SELECT last_insert_rowid() as id');
      const genId = Number(last?.id ?? 0);

      // mark idempotency done
      try {
        markIdempotencyDone(idempotencyKey, genId);
      } catch (e) {
        logger.warn(`Failed to mark idempotency done for key=${idempotencyKey}`, { err: e });
        // proceed regardless
      }

      const genRow = get('SELECT id, userId, prompt, style, imageUrl, status, createdAt FROM generations WHERE id = ?', [genId]);
      logger.info(`Generation created (id=${genId}) for user=${userId} key=${idempotencyKey}`);
      return { code: 201, body: genRow };
    } catch (insertErr: any) {
      logger.error(`Error inserting generation for user=${userId}: ${insertErr.stack || insertErr}`);
      try {
        markIdempotencyFailed(idempotencyKey);
      } catch (_) {
        // ignore mark failure
      }
      return { code: 500, body: { message: 'Server error' } };
    }
  } catch (err: any) {
    // final fallback: mark idempotency failed
    try {
      markIdempotencyFailed(idempotencyKey);
    } catch (_) {
      // ignore
    }

    if (err instanceof ModelOverloadError || err.name === 'ModelOverloadError') {
      logger.warn(`Model overloaded for user=${userId}: ${err.message}`);
      return { code: 503, body: { message: 'Model overloaded' } };
    }

    logger.error(`createGenerationWithIdempotency unexpected error for user=${userId}: ${err.stack || err}`);
    return { code: 500, body: { message: 'Server error' } };
  }
}
