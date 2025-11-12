// backend/src/services/generationService.ts
import path from 'path';
import fs from 'fs';
import db from '../models/db';
import { saveUploadedFile } from './imageService'; 

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
 * Creates a generation record. Simulates delay and a random overload error (20%).
 * Handles saving uploaded file if provided (multer file).
 *
 * @param userId - id of the user creating the generation
 * @param prompt - image prompt
 * @param style - chosen style
 * @param file - multer file (optional)
 */
export async function createGenerationService(
  userId: number,
  prompt: string,
  style: string,
  file?: Express.Multer.File
): Promise<GenerationResult> {
  // simulate delay 1-2s for spinning up model
  await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));

  if (randomOverload()) {
    // simulate overload error
    throw new ModelOverloadError();
  }

  let imageUrl: string | null = null;

  if (file) {
    const tmpPath = (file as any).path || undefined;
    const originalName = file.originalname;
    if (tmpPath) {
      const saved = await saveUploadedFile(tmpPath, originalName);
      imageUrl = saved?.urlPath ?? null;
    } else if ((file as any).buffer) {
      // write buffer to tmp file then save
      const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const tmpFile = path.join(uploadsDir, `tmp-${Date.now()}.bin`);
      fs.writeFileSync(tmpFile, (file as any).buffer);
      const saved = await saveUploadedFile(tmpFile, originalName);
      imageUrl = saved?.urlPath ?? null;
    }
  }

  const createdAt = new Date().toISOString();
  const stmt = db.prepare(
    'INSERT INTO generations (userId, prompt, style, imageUrl, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const info = stmt.run(userId, prompt, style, imageUrl, 'done', createdAt);

  return {
    id: Number(info.lastInsertRowid),
    prompt,
    style,
    imageUrl,
    status: 'done',
    createdAt
  };
}

/**
 * Returns last `limit` generations for a user (ordered desc).
 */
export function listGenerationsService(userId: number, limit = 5) {
  const l = Math.max(1, Math.min(100, limit));
  const rows = db
    .prepare(
      'SELECT id, prompt, style, imageUrl, status, createdAt FROM generations WHERE userId = ? ORDER BY id DESC LIMIT ?'
    )
    .all(userId, l);
  return rows as GenerationResult[];
}
