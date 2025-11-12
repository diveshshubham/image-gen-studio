import { Request, Response } from 'express';
import { createUser, authenticateUser } from '../services/authService';
import logger from '../utils/logger';

export async function signup(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };

  try {
    logger.debug(`Signup request received for email: ${email}`);

    const user = await createUser(email, password);
    logger.info(`User signed up successfully: ${email}`);

    return res.status(201).json(user);
  } catch (err: any) {
    // Detect SQLite unique constraint error
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || /unique/i.test(String(err?.message || ''))) {
      logger.warn(`Signup failed — user already exists: ${email}`);
      return res.status(400).json({ message: 'User already exists' });
    }

    logger.error(`Signup error for ${email}: ${err.stack || err}`);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };

  try {
    logger.debug(`Login request received for email: ${email}`);

    const token = await authenticateUser(email, password);
    logger.info(`User logged in successfully: ${email}`);

    return res.json({ token });
  } catch (err: any) {
    if (err.message === 'Invalid credentials') {
      logger.warn(`Login failed for ${email} — invalid credentials`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    logger.error(`Login error for ${email}: ${err.stack || err}`);
    return res.status(500).json({ message: 'Server error' });
  }
}
