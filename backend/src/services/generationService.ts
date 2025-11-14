import fs from 'fs';
import path from 'path';
import { initDb, run, get, all } from '../models/db';
import { saveUploadedFile } from './imageService';
import logger from '../utils/logger';

export class ModelOverloadError extends Error {
  constructor(message = 'Model overloaded') {
    super(message);
    this.name = 'ModelOverloadError';
  }
}

function randomOverload() {
  return Math.random() < 0.2;
}

export interface GenerationResult {
  id: number;
  prompt: string;
  style: string;
  imageUrl: string | null;
  status: string;
  createdAt: string;
}

/**
 * Core generation logic. When options.skipInsert is true, the function will
 * perform the model/file work and return a "partial" result WITHOUT inserting
 * into DB. When skipInsert is false (default), it will insert into DB and
 * return the inserted row (with id if available).
 *
 * options:
 *  - skipInsert?: boolean
 */
export async function createGenerationService(
  userId: number,
  prompt: string,
  style: string,
  file?: Express.Multer.File,
  options?: { skipInsert?: boolean }
): Promise<GenerationResult> {
  await initDb();
  logger.debug(`Starting generation for user ${userId} with style "${style}" (skipInsert=${!!options?.skipInsert})`);

  try {
    // simulate model delay
    const delay = 1000 + Math.random() * 1000;
    logger.debug(`Simulating model startup delay of ${Math.round(delay)}ms`);
    await new Promise((r) => setTimeout(r, delay));

    // random overload
    if (randomOverload()) {
      logger.warn(`Model overload simulated for user ${userId}`);
      throw new ModelOverloadError();
    }

    let imageUrl: string | null = null;

    if (file) {
      logger.debug(`Handling uploaded file: ${file.originalname}`);

      try {
        let bufferOrPath: Buffer | string | null = null;
        const originalName = file.originalname || 'upload.png';

        if ((file as any).buffer && Buffer.isBuffer((file as any).buffer)) {
          bufferOrPath = (file as any).buffer as Buffer;
          logger.debug(
            `Got buffer for uploaded file ${originalName} (size=${(bufferOrPath as Buffer).length})`
          );
        } else if ((file as any).path && typeof (file as any).path === 'string') {
          const tmpPath = (file as any).path as string;
          bufferOrPath = tmpPath;
          logger.debug(`Using disk temp file for upload: ${tmpPath}`);
        } else {
          const m = `Uploaded file missing both buffer and path for ${originalName}`;
          logger.error(m);
          throw new Error(m);
        }

        // Accept either string or object return from saveUploadedFile (tests mock a string)
        const saved: any = await saveUploadedFile(bufferOrPath, originalName);
        if (!saved && saved !== '') {
          const m = `saveUploadedFile returned null/undefined for ${originalName}`;
          logger.error(m);
          throw new Error(m);
        }

        // Normalize possible return shapes:
        // - string -> treat as url/path
        // - { urlPath } or { path } -> extract
        // - other -> coerce to string
        if (typeof saved === 'string') {
          imageUrl = saved;
        } else if (typeof saved === 'object' && saved !== null) {
          imageUrl = (saved.urlPath ?? saved.path ?? saved.url ?? null) as string | null;
        } else {
          imageUrl = String(saved) || null;
        }

        logger.info(`File saved successfully: ${imageUrl}`);
      } catch (fileErr: any) {
        logger.error(`Error saving uploaded file for user ${userId}: ${fileErr.stack || fileErr}`);
        throw fileErr;
      }
    }

    const createdAt = new Date().toISOString();

    // If skipInsert -> return a partial object, controller or idempotency service will persist.
    if (options?.skipInsert) {
      const partial: GenerationResult = {
        id: 0,
        prompt,
        style,
        imageUrl,
        status: 'done',
        createdAt,
      };
      logger.info(`Generation completed (skipInsert) for user=${userId}`);
      return partial;
    }

    // Insert generation record (status 'done' here for synchronous demo)
    run(
      'INSERT INTO generations (userId, prompt, style, imageUrl, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, prompt, style, imageUrl, 'done', createdAt]
    );

    // Try to get last insert id. If missing, fallback to selecting the most recent row
    let last = get<{ id: number }>('SELECT last_insert_rowid() as id');
    let genId = Number(last?.id ?? 0);
    if (!genId || genId === 0 || Number.isNaN(genId)) {
      // fallback: fetch most recent generation for this user by id DESC
      const fallback = get<{ id: number }>(
        'SELECT id FROM generations WHERE userId = ? ORDER BY id DESC LIMIT 1',
        [userId]
      );
      genId = Number(fallback?.id ?? 0);
    }

    if (!genId || genId === 0) {
      logger.warn(`Could not determine inserted generation id for user=${userId}`);
    }

    const generation: GenerationResult = {
      id: genId,
      prompt,
      style,
      imageUrl,
      status: 'done',
      createdAt,
    };

    logger.info(`Generation created (id=${generation.id}) for user=${userId}`);
    return generation;
  } catch (err: any) {
    if (err instanceof ModelOverloadError) {
      logger.warn(`ModelOverloadError for user ${userId}: ${err.message}`);
    } else {
      logger.error(`Error creating generation for user ${userId}: ${err.stack || err}`);
    }
    throw err;
  }
}

/**
 * List last `limit` generations for a user (async).
 * NOTE: By default only returns successful generations (status = 'done').
 */
export async function listGenerationsService(userId: number, limit = 5): Promise<GenerationResult[]> {
  await initDb();
  const l = Math.max(1, Math.min(100, limit));
  logger.debug(`Fetching last ${l} successful generations for user ${userId}`);

  try {
    // Only fetch rows with status = 'done'
    const sql = `SELECT id, prompt, style, imageUrl, status, createdAt
                 FROM generations 
                 WHERE userId = ? AND status = 'done'
                 ORDER BY id DESC 
                 LIMIT ${l}`;

    const rows = all<GenerationResult>(sql, [userId]);

    logger.info(`Fetched ${rows.length} successful generations for user ${userId}`);
    return rows;
  } catch (err: any) {
    logger.error(`Error listing successful generations for user ${userId}: ${err.stack || err}`);
    throw err;
  }
}
