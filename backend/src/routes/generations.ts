// backend/src/routes/generations.ts
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createGeneration, listGenerations } from '../controllers/generationsController';
import { requireAuth } from '../middlewares/auth';
import { validateBody } from '../middlewares/validate';
import { generationSchema } from '../validators/generationValidator';

const router = Router();

// temporary uploads directory (multer will write files here) later can be moved to cloud storage
const tmpDir = path.join(__dirname, '..', '..', 'uploads', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/', requireAuth, upload.single('image'), validateBody(generationSchema), createGeneration);
router.get('/', requireAuth, listGenerations);

export default router;
