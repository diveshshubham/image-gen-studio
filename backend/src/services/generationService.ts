// backend/src/services/generationService.ts
import path from 'path';
import fs from 'fs';
import db from '../models/db';
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
 * Creates a generation record. Simulates delay and random overload error (20%).
 * Handles saving uploaded file if provided.
 */
export async function createGenerationService(
  userId: number,
  prompt: string,
  style: string,
  file?: Express.Multer.File
): Promise<GenerationResult> {
  logger.debug(`Starting generation for user ${userId} with style "${style}"`);

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
      const tmpPath = (file as any).path || undefined;
      const originalName = file.originalname;

      try {
        if (tmpPath) {
          const saved = await saveUploadedFile(tmpPath, originalName);
          imageUrl = saved?.urlPath ?? null;
          logger.info(`File saved successfully: ${imageUrl}`);
        } else if ((file as any).buffer) {
          const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

          const tmpFile = path.join(uploadsDir, `tmp-${Date.now()}.bin`);
          fs.writeFileSync(tmpFile, (file as any).buffer);

          const saved = await saveUploadedFile(tmpFile, originalName);
          imageUrl = saved?.urlPath ?? null;
          logger.info(`Buffered file saved successfully: ${imageUrl}`);
        }
      } catch (fileErr: any) {
        logger.error(`Error saving uploaded file for user ${userId}: ${fileErr.stack || fileErr}`);
        throw fileErr;
      }
    }

    const createdAt = new Date().toISOString();
    const stmt = db.prepare(
      'INSERT INTO generations (userId, prompt, style, imageUrl, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(userId, prompt, style, imageUrl, 'done', createdAt);

    const generation = {
      id: Number(info.lastInsertRowid),
      prompt,
      style,
      imageUrl,
      status: 'done',
      createdAt,
    };

    logger.info(`Generation ${generation.id} completed successfully for user ${userId}`);
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
 * Returns last `limit` generations for a user (ordered desc).
 */
export function listGenerationsService(userId: number, limit = 5) {
  const l = Math.max(1, Math.min(100, limit));
  logger.debug(`Fetching last ${l} generations for user ${userId}`);

  try {
    const rows = db
      .prepare(
        'SELECT id, prompt, style, imageUrl, status, createdAt FROM generations WHERE userId = ? ORDER BY id DESC LIMIT ?'
      )
      .all(userId, l);

    logger.info(`Fetched ${rows.length} generations for user ${userId}`);
    return rows as GenerationResult[];
  } catch (err: any) {
    logger.error(`Error listing generations for user ${userId}: ${err.stack || err}`);
    throw err;
  }
}
