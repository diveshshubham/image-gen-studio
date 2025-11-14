import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import logger from '../utils/logger';
import { listGenerationsService } from '../services/generationService';
import { createGenerationWithIdempotency } from '../services/idempotencyService';

export async function createGeneration(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { prompt, style } = req.body as { prompt: string; style: string };
  const file = (req as any).file as Express.Multer.File | undefined;

  logger.debug(`createGeneration controller called by user=${userId}`);

  // input validation (prompt/style still validated in controller to fail fast)
  if (!prompt || !style) {
    logger.warn(`createGeneration missing input for user=${userId}`, {
      missingPrompt: !prompt,
      missingStyle: !style,
    });
    return res.status(400).json({ message: 'Missing prompt or style' });
  }

  const idempotencyKey =
    (req.headers['idempotency-key'] as string) || (req.body?.idempotencyKey as string);

  try {
    // delegate entire idempotency + generation flow to service
    const { code, body } = await createGenerationWithIdempotency(
      userId,
      prompt,
      style,
      file,
      idempotencyKey
    );
    return res.status(code).json(body);
  } catch (err: any) {
    logger.error(`createGeneration unexpected error for user=${userId}: ${err.stack || err}`);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function listGenerations(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const limitRaw = req.query.limit as string | undefined;
  const limit = limitRaw ? parseInt(limitRaw, 10) : 5;

  logger.debug(`listGenerations called by user=${userId} limit=${limit}`);

  try {
    const rows = await listGenerationsService(userId, limit);
    logger.info(`listGenerations returned ${(await rows).length} rows for user=${userId}`);
    return res.json(rows);
  } catch (err: any) {
    logger.error(`listGenerations error for user=${userId}: ${err.stack || err}`);
    return res.status(500).json({ message: 'Server error' });
  }
}
