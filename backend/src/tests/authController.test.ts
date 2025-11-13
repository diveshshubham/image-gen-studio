// tests/controllers/authController.test.ts
import { signup, login } from '../controllers/authController';
import * as authService from '../services/authService';
import logger from '../utils/logger';

jest.mock('../services/authService');

jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));


import mockedLogger from '../utils/logger';

function makeRes() {
  const json = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json, _status: status, _json: json } as any;
}

describe('authController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('signup', () => {
    it('returns 201 and created user on success', async () => {
      const req: any = { body: { email: 'a@b.com', password: 'p' } };
      const res = makeRes();

      (authService.createUser as jest.Mock).mockResolvedValue({ id: 1, email: 'a@b.com', createdAt: 'x' });

      await signup(req, res);

      expect(authService.createUser).toHaveBeenCalledWith('a@b.com', 'p');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res._json).toHaveBeenCalledWith({ id: 1, email: 'a@b.com', createdAt: 'x' });
      expect(mockedLogger.info).toHaveBeenCalled();
    });

    it('returns 400 when user exists', async () => {
      const req: any = { body: { email: 'a@b.com', password: 'p' } };
      const res = makeRes();

      const err = { code: 'SQLITE_CONSTRAINT_UNIQUE', message: 'unique' };
      (authService.createUser as jest.Mock).mockRejectedValue(err);

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._json).toHaveBeenCalledWith({ message: 'User already exists' });
      expect(mockedLogger.warn).toHaveBeenCalled();
    });

    it('returns 500 on unexpected error', async () => {
      const req: any = { body: { email: 'a@b.com', password: 'p' } };
      const res = makeRes();

      (authService.createUser as jest.Mock).mockRejectedValue(new Error('boom'));

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res._json).toHaveBeenCalledWith({ message: 'Server error' });
      expect(mockedLogger.error).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns token on success', async () => {
      const req: any = { body: { email: 'u@u.com', password: 'pw' } };
      const res = makeRes();

      (authService.authenticateUser as jest.Mock).mockResolvedValue('jwt-token');

      await login(req, res);

      expect(authService.authenticateUser).toHaveBeenCalledWith('u@u.com', 'pw');
      expect(res._json).toHaveBeenCalledWith({ token: 'jwt-token' });
      expect(mockedLogger.info).toHaveBeenCalled();
    });

    it('returns 401 on invalid credentials', async () => {
      const req: any = { body: { email: 'u@u.com', password: 'pw' } };
      const res = makeRes();

      (authService.authenticateUser as jest.Mock).mockRejectedValue(new Error('Invalid credentials'));

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res._json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
      expect(mockedLogger.warn).toHaveBeenCalled();
    });

    it('returns 500 on unexpected error', async () => {
      const req: any = { body: { email: 'u@u.com', password: 'pw' } };
      const res = makeRes();

      (authService.authenticateUser as jest.Mock).mockRejectedValue(new Error('boom'));

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res._json).toHaveBeenCalledWith({ message: 'Server error' });
      expect(mockedLogger.error).toHaveBeenCalled();
    });
  });
});
