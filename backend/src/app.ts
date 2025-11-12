import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth';
import genRoutes from './routes/generations';

const app = express();
app.use(cors());
app.use(express.json());

// 🟢 Absolute path to the real uploads folder
const uploadsDir = path.join(__dirname, '..', 'uploads');
console.log('Uploads directory path:', uploadsDir);
// Ensure folder exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

// 🟢 Serve it statically at /uploads temp
app.use('/uploads', express.static(uploadsDir));

// API routes
app.use('/auth', authRoutes);
app.use('/generations', genRoutes);

// Debugging line (optional)
console.log('Serving static uploads from:', uploadsDir);

export default app;
