import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import logger from './utils/logger'; 

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const HOST = process.env.HOST || '0.0.0.0';

try {
  app.listen(PORT, HOST, () => {
    logger.info(`🚀 Server running on http://${HOST}:${PORT}`);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Environment: ${process.env.NODE_ENV || 'development'}`);
    }
  });
} catch (err: any) {
  logger.error(`❌ Failed to start server: ${err.stack || err}`);
  process.exit(1);
}
