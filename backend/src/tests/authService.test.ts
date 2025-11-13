
import db from '../models/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

// mock modules using the same relative paths as the imports above
jest.mock('../models/db');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));



import { createUser, authenticateUser } from '../services/authService';

describe('authService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('createUser', () => {
    it('creates a user and returns CreatedUser', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pass');

      const runMock = jest.fn().mockReturnValue({ lastInsertRowid: 42 });
      (db.prepare as jest.Mock).mockReturnValue({ run: runMock });

      const res = await createUser('a@b.com', 'password123');

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(db.prepare).toHaveBeenCalled();
      expect(runMock).toHaveBeenCalledWith('a@b.com', 'hashed-pass', expect.any(String));
      expect(res).toEqual({
        id: 42,
        email: 'a@b.com',
        createdAt: expect.any(String),
      });

      expect(logger.debug).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('User created successfully'));
    });

    it('rethrows and logs on SQLITE_CONSTRAINT_UNIQUE', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pass');

      const err = { code: 'SQLITE_CONSTRAINT_UNIQUE', message: 'unique constraint' };
      const runMock = jest.fn().mockImplementation(() => { throw err; });
      (db.prepare as jest.Mock).mockReturnValue({ run: runMock });

      await expect(createUser('a@b.com', 'p')).rejects.toBe(err);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('User creation failed - already exists'));
    });

    it('logs and rethrows unexpected errors', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pass');
      const err = new Error('disk full');
      const runMock = jest.fn().mockImplementation(() => { throw err; });
      (db.prepare as jest.Mock).mockReturnValue({ run: runMock });

      await expect(createUser('x@y.com', 'p')).rejects.toThrow('disk full');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error creating user'));

    });
  });

  describe('authenticateUser', () => {
    it('returns jwt token when credentials are valid', async () => {
      // mock DB get
      const getMock = jest.fn().mockReturnValue({ id: 7, password: 'hashed' });
      (db.prepare as jest.Mock).mockReturnValue({ get: getMock });

      // mock bcrypt.compare to succeed
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      // mock jwt.sign
      (jwt.sign as jest.Mock).mockReturnValue('signed-token');

      const token = await authenticateUser('me@you.com', 'password');

      expect(db.prepare).toHaveBeenCalled();
      expect(getMock).toHaveBeenCalledWith('me@you.com');
      expect(bcrypt.compare).toHaveBeenCalledWith('password', 'hashed');
      expect(jwt.sign).toHaveBeenCalledWith({ userId: 7 }, expect.anything(), expect.any(Object));
      expect(token).toBe('signed-token');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('User authenticated successfully'));
    });

    it('throws when user not found', async () => {
      const getMock = jest.fn().mockReturnValue(undefined);
      (db.prepare as jest.Mock).mockReturnValue({ get: getMock });

      (bcrypt.compare as jest.Mock).mockResolvedValue(false); 

      await expect(authenticateUser('no@one.com', 'p')).rejects.toThrow('Invalid credentials');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Authentication failed - no user found'));
    });

    it('throws when password is wrong', async () => {
      const getMock = jest.fn().mockReturnValue({ id: 9, password: 'hashed' });
      (db.prepare as jest.Mock).mockReturnValue({ get: getMock });

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authenticateUser('me@you.com', 'bad')).rejects.toThrow('Invalid credentials');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Authentication failed - wrong password'));
    });

    it('logs and rethrows unexpected errors', async () => {
      const getMock = jest.fn().mockReturnValue({ id: 9, password: 'hashed' });
      (db.prepare as jest.Mock).mockReturnValue({ get: getMock });

      (bcrypt.compare as jest.Mock).mockRejectedValue(new Error('bcrypt explosion'));

      await expect(authenticateUser('ok@ok.com', 'p')).rejects.toThrow('bcrypt explosion');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error authenticating user'));
    });
  });
});
