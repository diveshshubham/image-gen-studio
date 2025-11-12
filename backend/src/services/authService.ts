// backend/src/services/authService.ts
import bcrypt from 'bcrypt';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import db from '../models/db';
import logger from '../utils/logger'; 

const JWT_SECRET: Secret = process.env.JWT_SECRET ?? 'default_secret_key';

function getExpiresIn(): string | number {
  const raw = process.env.JWT_EXPIRES_IN;
  if (!raw) return '7d';
  const maybeNum = Number(raw);
  if (!Number.isNaN(maybeNum) && String(maybeNum) === raw.trim()) {
    return maybeNum;
  }
  return raw;
}

const JWT_EXPIRES_IN: string | number = getExpiresIn();

export interface CreatedUser {
  id: number;
  email: string;
  createdAt: string;
}

export async function createUser(email: string, password: string): Promise<CreatedUser> {
  try {
    logger.debug(`Attempting to create user with email: ${email}`);
    const hashed = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();

    const stmt = db.prepare('INSERT INTO users (email, password, createdAt) VALUES (?, ?, ?)');
    const info = stmt.run(email, hashed, createdAt);

    const user = {
      id: Number(info.lastInsertRowid),
      email,
      createdAt,
    };

    logger.info(`User created successfully: ${email}`);
    return user;
  } catch (err: any) {
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      logger.warn(`User creation failed - already exists: ${email}`);
    } else {
      logger.error(`Error creating user ${email}: ${err.stack || err}`);
    }
    throw err; // rethrow for controller to handle
  }
}

export async function authenticateUser(email: string, password: string): Promise<string> {
  try {
    logger.debug(`Authenticating user: ${email}`);

    const row = db.prepare('SELECT id, password FROM users WHERE email = ?').get(email) as
      | { id: number; password: string }
      | undefined;

    if (!row) {
      logger.warn(`Authentication failed - no user found: ${email}`);
      throw new Error('Invalid credentials');
    }

    const match = await bcrypt.compare(password, row.password);
    if (!match) {
      logger.warn(`Authentication failed - wrong password: ${email}`);
      throw new Error('Invalid credentials');
    }

    const signOptions: SignOptions = {
      expiresIn: JWT_EXPIRES_IN as number,
    };

    const token = jwt.sign({ userId: row.id }, JWT_SECRET, signOptions);
    logger.info(`User authenticated successfully: ${email}`);

    return token;
  } catch (err: any) {
    logger.error(`Error authenticating user ${email}: ${err.stack || err}`);
    throw err;
  }
}
