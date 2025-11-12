import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import logger from '../utils/logger';

const UPLOADS = path.join(__dirname, '..', '..', 'uploads');

export interface SaveResult {
  urlPath: string; // relative URL path e.g. /uploads/...
}

export async function saveUploadedFile(tmpPath: string | undefined, originalName: string | undefined): Promise<SaveResult | null> {
  if (!tmpPath || !originalName) {
    logger.warn('saveUploadedFile called with missing tmpPath or originalName', { tmpPath: !!tmpPath, originalName: !!originalName });
    return null;
  }

  // ensure uploads directory exists
  try {
    if (!fs.existsSync(UPLOADS)) {
      fs.mkdirSync(UPLOADS, { recursive: true });
      logger.info(`Created uploads directory at ${UPLOADS}`);
    }
  } catch (dirErr: any) {
    logger.error(`Failed to ensure uploads directory ${UPLOADS}: ${dirErr.stack || dirErr}`);
    return null;
  }

  const ext = path.extname(originalName) || '.png';
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const dest = path.join(UPLOADS, filename);

  logger.debug(`Saving uploaded file. originalName=${originalName} dest=${dest}`);

  // Try to resize if sharp available; otherwise fallback to copy
  try {
    await sharp(tmpPath)
      .resize({ width: 1920, withoutEnlargement: true })
      .toFile(dest);

    logger.info(`Image saved (resized) to ${dest} for originalName=${originalName}`);
  } catch (sharpErr: any) {
    logger.warn(`Sharp resize failed for ${originalName}, falling back to copy. Reason: ${sharpErr.message || sharpErr}`);

    // fallback to copy
    try {
      fs.copyFileSync(tmpPath, dest);
      logger.info(`Image saved (copied) to ${dest} for originalName=${originalName}`);
    } catch (copyErr: any) {
      logger.error(`Failed to copy uploaded file ${originalName} to ${dest}: ${copyErr.stack || copyErr}`);
      return null;
    }
  }

  // attempt to delete tmp file (best-effort)
  try {
    fs.unlinkSync(tmpPath);
    logger.debug(`Temporary file deleted: ${tmpPath}`);
  } catch (unlinkErr: any) {
    logger.warn(`Could not delete temporary file ${tmpPath}: ${unlinkErr.message || unlinkErr}`);
    // continue — not fatal
  }

  const urlPath = `/uploads/${filename}`;
  logger.debug(`Returning save result urlPath=${urlPath}`);
  return { urlPath };
}
