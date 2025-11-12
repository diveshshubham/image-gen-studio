import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';

const UPLOADS = path.join(__dirname, '..', '..', 'uploads');

export interface SaveResult {
  urlPath: string; // relative URL path e.g. /uploads/...
}

export async function saveUploadedFile(tmpPath: string | undefined, originalName: string | undefined): Promise<SaveResult | null> {
  if (!tmpPath || !originalName) return null;
  const ext = path.extname(originalName) || '.png';
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const dest = path.join(UPLOADS, filename);

  // Try to resize if sharp available; otherwise move
  try {
    await sharp(tmpPath).resize({ width: 1920, withoutEnlargement: true }).toFile(dest);
  } catch (e) {
    // fallback to rename/move
    try {
      fs.copyFileSync(tmpPath, dest);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to save uploaded file', err);
      return null;
    }
  }
  // delete tmp file
  try {
    fs.unlinkSync(tmpPath);
  } catch {
    // ignore
  }
  const urlPath = `/uploads/${filename}`;
  return { urlPath };
}
