// backend/src/controllers/generationsController.ts
import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { createGenerationService, listGenerationsService, ModelOverloadError } from '../services/generationService';

export async function createGeneration(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { prompt, style } = req.body as { prompt: string; style: string; };
  //assuming image will get uploaded and we will get from cleint

  if (!prompt || !style ) {
    return res.status(400).json({ message: 'Missing prompt or style' });
  }

  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    const result = await createGenerationService(userId, prompt, style, file);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof ModelOverloadError || err.name === 'ModelOverloadError') {
      return res.status(503).json({ message: 'Model overloaded' });
    }
    // eslint-disable-next-line no-console
    console.error('createGeneration error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function listGenerations(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const limitRaw = req.query.limit as string | undefined;
  const limit = limitRaw ? parseInt(limitRaw, 10) : 5;
  try {
    const rows = listGenerationsService(userId, limit);
    return res.json(rows);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('listGenerations error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
