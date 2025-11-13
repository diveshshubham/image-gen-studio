// backend/src/services/authService.ts
import bcrypt from 'bcrypt';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { initDb, run, get } from '../models/db'; 
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

/**
 * Create a new user.
 * Throws on error (including duplicate email).
 */
export async function createUser(email: string, password: string): Promise<CreatedUser> {
  await initDb();

  try {
    logger.debug(`Attempting to create user with email: ${email}`);

    const hashed = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();

    // Insert user
    run('INSERT INTO users (email, password, createdAt) VALUES (?, ?, ?)', [email, hashed, createdAt]);

    // read last insert id
    const last = get<{ id: number }>('SELECT last_insert_rowid() as id');
    const id = last?.id ?? NaN;

    const user: CreatedUser = {
      id: Number(id),
      email,
      createdAt,
    };

    logger.info(`User created successfully: ${email}`);
    return user;
  } catch (err: any) {
    // sql.js reports errors as Error with message containing SQLite text.
    const msg = String(err?.message ?? err);
    if (msg.includes('UNIQUE constraint') || msg.includes('UNIQUE') || msg.includes('constraint failed')) {
      logger.warn(`User creation failed - already exists: ${email}`);
    } else {
      logger.error(`Error creating user ${email}: ${err?.stack ?? err}`);
    }
    throw err;
  }
}

/**
 * Authenticate a user and return a JWT token on success.
 * Throws Error('Invalid credentials') on bad credentials.
 */
export async function authenticateUser(email: string, password: string): Promise<string> {
  await initDb();

  try {
    logger.debug(`Authenticating user: ${email}`);

    const row = get<{ id: number; password: string }>('SELECT id, password FROM users WHERE email = ?', [email]);

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
    logger.error(`Error authenticating user ${email}: ${err?.stack ?? err}`);
    throw err;
  }
}
