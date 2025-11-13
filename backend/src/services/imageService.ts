// backend/src/services/imageService.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import logger from '../utils/logger';

const UPLOADS = path.join(process.cwd(), 'uploads');

export type SaveResult = { urlPath: string } | null;

/**
 * Save an uploaded file.
 * Accepts either:
 *  - tmpPath: string (path to a temporary file on disk) OR
 *  - tmpPath: Buffer (file buffer from multer.memoryStorage)
 * originalName must be provided (used for extension).
 *
 * Returns { urlPath } on success or null on failure.
 */
export async function saveUploadedFile(
  tmpPath: string | Buffer | undefined,
  originalName?: string
): Promise<SaveResult> {
  if (!tmpPath || !originalName) {
    logger.warn('saveUploadedFile called with missing tmpPath or originalName', {
      tmpPath: !!tmpPath,
      originalName: !!originalName,
    });
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

  // Helper to write buffer directly
  const writeBuffer = async (buffer: Buffer) => {
    try {
      // Try to use sharp to resize from buffer and write to dest
      await sharp(buffer).resize({ width: 1920, withoutEnlargement: true }).toFile(dest);
      logger.info(`Image saved (resized from buffer) to ${dest} for originalName=${originalName}`);
      return true;
    } catch (sharpErr: any) {
      logger.warn(
        `Sharp resize from buffer failed for ${originalName}, falling back to write. Reason: ${sharpErr.message || sharpErr}`
      );
      try {
        await fs.promises.writeFile(dest, buffer);
        logger.info(`Image saved (written from buffer) to ${dest} for originalName=${originalName}`);
        return true;
      } catch (writeErr: any) {
        logger.error(`Failed to write buffer to ${dest}: ${writeErr.stack || writeErr}`);
        return false;
      }
    }
  };

  // Main saving logic: handle Buffer or disk path
  try {
    if (Buffer.isBuffer(tmpPath)) {
      // tmpPath is actually the file buffer
      const ok = await writeBuffer(tmpPath);
      if (!ok) return null;
    } else {
      // tmpPath is a string path on disk
      const tmpFile = tmpPath as string;
      if (!fs.existsSync(tmpFile)) {
        const m = `Uploaded file path not found on disk: ${tmpFile}`;
        logger.error(m);
        return null;
      }

      // Try sharp from file path
      try {
        await sharp(tmpFile).resize({ width: 1920, withoutEnlargement: true }).toFile(dest);
        logger.info(`Image saved (resized from disk) to ${dest} for originalName=${originalName}`);
      } catch (sharpErr: any) {
        logger.warn(
          `Sharp resize from disk failed for ${originalName}, falling back to copy. Reason: ${sharpErr.message || sharpErr}`
        );
        try {
          fs.copyFileSync(tmpFile, dest);
          logger.info(`Image saved (copied) to ${dest} for originalName=${originalName}`);
        } catch (copyErr: any) {
          logger.error(`Failed to copy uploaded file ${originalName} to ${dest}: ${copyErr.stack || copyErr}`);
          return null;
        }
      }

      // attempt to delete tmp file (best-effort)
      try {
        fs.unlinkSync(tmpFile);
        logger.debug(`Temporary file deleted: ${tmpFile}`);
      } catch (unlinkErr: any) {
        logger.warn(`Could not delete temporary file ${tmpFile}: ${unlinkErr.message || unlinkErr}`);
        // continue — not fatal
      }
    }
  } catch (err: any) {
    logger.error(`Unexpected error saving uploaded file ${originalName}: ${err.stack || err}`);
    return null;
  }

  const urlPath = `/uploads/${filename}`;
  logger.debug(`Returning save result urlPath=${urlPath}`);
  return { urlPath };
}
