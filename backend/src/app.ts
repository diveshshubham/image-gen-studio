import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth';
import genRoutes from './routes/generations';
import logger from './utils/logger';

const app = express();

app.use(cors());
app.use(express.json());

// 🟢 Absolute path to the real uploads folder
const uploadsDir = path.join(__dirname, '..', 'uploads');
logger.info(`Uploads directory path: ${uploadsDir}`);

// Ensure folder exists
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    logger.info(`Created uploads directory: ${uploadsDir}`);
  } else {
    logger.debug(`Uploads directory already exists: ${uploadsDir}`);
  }
} catch (err: any) {
  logger.error(`Error creating uploads directory: ${err.stack || err}`);
}

// 🟢 Serve static uploads
app.use('/uploads', express.static(uploadsDir));
logger.info(`Serving static uploads from: ${uploadsDir}`);

// 🧩 API routes
app.use('/auth', authRoutes);
app.use('/generations', genRoutes);
logger.info('API routes mounted: /auth, /generations');

// 🧠 Health-check endpoint (optional)
app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Server running smoothly 🚀' });
});

// 🧾 Handle 404 routes
app.use((_req, res) => {
  logger.warn(`404 - Not Found: ${_req.method} ${_req.originalUrl}`);
  res.status(404).json({ message: 'Endpoint not found' });
});

// 🛠️ Error-handling middleware (optional but useful)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`Unhandled error: ${err.stack || err}`);
  res.status(500).json({ message: 'Internal Server Error' });
});

export default app;
