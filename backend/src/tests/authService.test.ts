// backend/src/__tests__/authService.test.ts
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// mock the db helper module (initDb, run, get)
jest.mock('../../src/models/db', () => ({
  initDb: jest.fn(),
  run: jest.fn(),
  get: jest.fn(),
}));

jest.mock('bcrypt');
jest.mock('jsonwebtoken');

jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import { createUser, authenticateUser } from '../services/authService';
import { initDb, run, get } from '../../src/models/db';
import logger from '../utils/logger';

describe('authService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('createUser', () => {
    it('creates a user and returns CreatedUser', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pass');

      // run() will be called to perform the INSERT
      (run as jest.Mock).mockImplementation(() => {
        // nothing to return; createUser uses get('SELECT last_insert_rowid() as id') to fetch id
      });

      // get() should return last_insert_rowid
      (get as jest.Mock).mockImplementation((sql: string) => {
        if (sql.includes('last_insert_rowid')) return { id: 42 };
        return null;
      });

      const res = await createUser('a@b.com', 'password123');

      expect(initDb).toHaveBeenCalled();
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      // ensure run was called with an INSERT statement and correct params
      expect((run as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
      const insertCall = (run as jest.Mock).mock.calls.find((c: any[]) =>
        String(c[0]).toLowerCase().includes('insert into users')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toEqual(['a@b.com', 'hashed-pass', expect.any(String)]);

      expect(get).toHaveBeenCalledWith('SELECT last_insert_rowid() as id');
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

      const err = { message: 'UNIQUE constraint failed: users.email' };
      (run as jest.Mock).mockImplementation(() => {
        throw err;
      });

      await expect(createUser('a@b.com', 'p')).rejects.toBe(err);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('User creation failed - already exists'));
    });

    it('logs and rethrows unexpected errors', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pass');
      const err = new Error('disk full');
      (run as jest.Mock).mockImplementation(() => {
        throw err;
      });

      await expect(createUser('x@y.com', 'p')).rejects.toThrow('disk full');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error creating user'));
    });
  });

  describe('authenticateUser', () => {
    it('returns jwt token when credentials are valid', async () => {
      // mock get to return stored user row
      (get as jest.Mock).mockImplementation((sql: string, params?: any[]) => {
        // For SELECT id, password FROM users WHERE email = ?
        if (sql.toLowerCase().includes('select id, password')) {
          return { id: 7, password: 'hashed' };
        }
        return null;
      });

      // mock bcrypt.compare to succeed
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      // mock jwt.sign
      (jwt.sign as jest.Mock).mockReturnValue('signed-token');

      const token = await authenticateUser('me@you.com', 'password');

      expect(initDb).toHaveBeenCalled();
      expect(get).toHaveBeenCalledWith(expect.stringContaining('SELECT id, password FROM users WHERE email = ?'), ['me@you.com']);
      expect(bcrypt.compare).toHaveBeenCalledWith('password', 'hashed');
      expect((jwt.sign as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(token).toBe('signed-token');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('User authenticated successfully'));
    });

    it('throws when user not found', async () => {
      (get as jest.Mock).mockImplementation(() => null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authenticateUser('no@one.com', 'p')).rejects.toThrow('Invalid credentials');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Authentication failed - no user found'));
    });

    it('throws when password is wrong', async () => {
      (get as jest.Mock).mockImplementation(() => ({ id: 9, password: 'hashed' }));
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authenticateUser('me@you.com', 'bad')).rejects.toThrow('Invalid credentials');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Authentication failed - wrong password'));
    });

    it('logs and rethrows unexpected errors', async () => {
      (get as jest.Mock).mockImplementation(() => ({ id: 9, password: 'hashed' }));
      (bcrypt.compare as jest.Mock).mockRejectedValue(new Error('bcrypt explosion'));

      await expect(authenticateUser('ok@ok.com', 'p')).rejects.toThrow('bcrypt explosion');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error authenticating user'));
    });
  });
});
