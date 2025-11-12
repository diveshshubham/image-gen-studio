import { Request, Response } from 'express';
import { createUser, authenticateUser } from '../services/authService';

export async function signup(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  try {
    const user = await createUser(email, password);
    return res.status(201).json(user);
  } catch (err: any) {
    // detect sqlite unique constraint error
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || /unique/i.test(String(err?.message || ''))) {
      return res.status(400).json({ message: 'User already exists' });
    }
    // eslint-disable-next-line no-console
    // apply logger
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  try {
    const token = await authenticateUser(email, password);
    return res.json({ token });
  } catch (err: any) {
    if (err.message === 'Invalid credentials') {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}
