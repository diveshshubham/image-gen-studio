// backend/src/controllers/generationsController.ts
import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import logger from '../utils/logger';
import {
  createGenerationService,
  listGenerationsService,
  ModelOverloadError,
} from '../services/generationService';

export async function createGeneration(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { prompt, style } = req.body as { prompt: string; style: string };

  logger.debug(`createGeneration called by user=${userId}`);

  // input validation
  if (!prompt || !style) {
    logger.warn(`createGeneration missing input for user=${userId}`, {
      missingPrompt: !prompt,
      missingStyle: !style,
    });
    return res.status(400).json({ message: 'Missing prompt or style' });
  }

  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (file) {
      // log presence/metadata but avoid logging file contents
      logger.debug(`createGeneration received file for user=${userId}`, {
        originalName: file.originalname,
        size: (file as any).size ?? null,
        hasBuffer: !!(file as any).buffer,
        hasPath: !!(file as any).path,
      });
    } else {
      logger.debug(`createGeneration no file uploaded for user=${userId}`);
    }

    const result = await createGenerationService(userId, prompt, style, file);
    logger.info(`Generation created (id=${result.id}) for user=${userId}`);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof ModelOverloadError || err.name === 'ModelOverloadError') {
      logger.warn(`Model overloaded for user=${userId}: ${err.message}`);
      return res.status(503).json({ message: 'Model overloaded' });
    }

    logger.error(`createGeneration error for user=${userId}: ${err.stack || err}`);
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
