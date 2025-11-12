// backend/src/services/authService.ts
import bcrypt from 'bcrypt';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import db from '../models/db';

const JWT_SECRET: Secret = process.env.JWT_SECRET ?? 'default_secret_key';

function getExpiresIn(): string | number {
  const raw = process.env.JWT_EXPIRES_IN;
  if (!raw) return '7d';
  // If it's a numeric string, parse to number
  const maybeNum = Number(raw);
  if (!Number.isNaN(maybeNum) && String(maybeNum) === raw.trim()) {
    return maybeNum;
  }
  // otherwise keep string (like '7d', '24h')
  return raw;
}

const JWT_EXPIRES_IN: string | number = getExpiresIn();

export interface CreatedUser {
  id: number;
  email: string;
  createdAt: string;
}

export async function createUser(email: string, password: string): Promise<CreatedUser> {
  const hashed = await bcrypt.hash(password, 10);
  const createdAt = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO users (email, password, createdAt) VALUES (?, ?, ?)');
  const info = stmt.run(email, hashed, createdAt);
  return {
    id: Number(info.lastInsertRowid),
    email,
    createdAt
  };
}

export async function authenticateUser(email: string, password: string): Promise<string> {
  const row = db.prepare('SELECT id, password FROM users WHERE email = ?').get(email) as
    | { id: number; password: string }
    | undefined;
  if (!row) {
    throw new Error('Invalid credentials');
  }
  const match = await bcrypt.compare(password, row.password);
  if (!match) {
    throw new Error('Invalid credentials');
  }

  // Build sign options with a properly typed expiresIn value
  const signOptions: SignOptions = {
    // `expiresIn` accepts string | number; ensure TypeScript knows that
    expiresIn: JWT_EXPIRES_IN as number 
  };

  const token = jwt.sign({ userId: row.id }, JWT_SECRET, signOptions);
  return token;
}
