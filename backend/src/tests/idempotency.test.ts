// tests/services/idempotencyService.test.ts
import { createGenerationWithIdempotency } from '../../src/services/idempotencyService';

// Mock the DB module functions used by the idempotency service
jest.mock('../../src/models/db', () => ({
  initDb: jest.fn(),
  getIdempotency: jest.fn(),
  createIdempotency: jest.fn(),
  markIdempotencyDone: jest.fn(),
  markIdempotencyFailed: jest.fn(),
  get: jest.fn(),
  run: jest.fn(),
}));

// Provide a mocked generationService including a ModelOverloadError class
jest.mock('../../src/services/generationService', () => {
  class ModelOverloadError extends Error {}
  return {
    createGenerationService: jest.fn(),
    ModelOverloadError,
  };
});

import * as db from '../../src/models/db';
import * as genSvc from '../../src/services/generationService';

const mockedDb = db as jest.Mocked<typeof db>;
const mockedGen = genSvc as jest.Mocked<typeof genSvc>;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('createGenerationWithIdempotency', () => {
  const userId = 42;
  const prompt = 'hello';
  const style = 'art';
  const file = undefined;

  it('returns 400 if idempotencyKey missing', async () => {
    const res = await createGenerationWithIdempotency(userId, prompt, style, file, undefined);
    expect(res).toEqual({ code: 400, body: { message: 'Missing idempotency key' } });
    expect(mockedDb.initDb).not.toHaveBeenCalled();
  });

  it('returns 200 with existing generation when idempotency status done', async () => {
    const key = 'k1';
    const genRow = { id: 5, userId, prompt, style, imageUrl: null, status: 'done', createdAt: 't' };

    // return the full idempotency record shape expected by the TypeScript types
    mockedDb.getIdempotency.mockReturnValue({
      key,
      userId,
      generationId: 5,
      status: 'done',
      createdAt: '2025-01-01T00:00:00Z',
    });

    // get should return the generation row when queried
    mockedDb.get.mockImplementation((q: string, params?: any[]) => {
      if (q.includes('FROM generations')) return genRow;
      return null;
    });

    const res = await createGenerationWithIdempotency(userId, prompt, style, file, key);
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ idempotent: true, generation: genRow });

    expect(mockedDb.initDb).toHaveBeenCalled();
    expect(mockedDb.getIdempotency).toHaveBeenCalledWith(key);
  });

  it('returns 202 when idempotency status in-progress', async () => {
    const key = 'k2';
    mockedDb.getIdempotency.mockReturnValue({
      key,
      userId: null,
      generationId: null,
      status: 'in-progress',
      createdAt: '2025-01-02T00:00:00Z',
    });

    const res = await createGenerationWithIdempotency(userId, prompt, style, file, key);
    expect(res).toEqual({ code: 202, body: { message: 'Generation in progress' } });
  });

  it('returns 409 when idempotency status failed', async () => {
    const key = 'k3';
    mockedDb.getIdempotency.mockReturnValue({
      key,
      userId: null,
      generationId: null,
      status: 'failed',
      createdAt: '2025-01-03T00:00:00Z',
    });

    const res = await createGenerationWithIdempotency(userId, prompt, style, file, key);
    expect(res.code).toBe(409);
    expect(res.body).toHaveProperty('message');
  });

  it('handles createIdempotency race -> re-check finds in-progress', async () => {
    const key = 'k4';
    // No existing at first check
    mockedDb.getIdempotency.mockReturnValueOnce(null);
    // createIdempotency throws (simulate duplicate/race)
    (mockedDb.createIdempotency as jest.Mock).mockImplementation(() => {
      throw new Error('unique constraint');
    });
    // re-check returns in-progress (full shape)
    mockedDb.getIdempotency.mockReturnValueOnce({
      key,
      userId: null,
      generationId: null,
      status: 'in-progress',
      createdAt: '2025-01-04T00:00:00Z',
    });

    const res = await createGenerationWithIdempotency(userId, prompt, style, file, key);
    expect(res).toEqual({ code: 202, body: { message: 'Generation in progress' } });
    expect(mockedDb.createIdempotency).toHaveBeenCalledWith(key, userId);
  });

  it('handles createIdempotency race -> re-check finds done and returns existing generation', async () => {
    const key = 'k5';
    const genRow = { id: 9, userId, prompt, style, imageUrl: null, status: 'done', createdAt: 't9' };

    mockedDb.getIdempotency.mockReturnValueOnce(null);
    (mockedDb.createIdempotency as jest.Mock).mockImplementation(() => {
      throw new Error('unique constraint');
    });
    // re-check returns done with generationId
    mockedDb.getIdempotency.mockReturnValueOnce({
      key,
      userId,
      generationId: 9,
      status: 'done',
      createdAt: '2025-01-05T00:00:00Z',
    });
    mockedDb.get.mockImplementation((q: string, params?: any[]) => {
      if (q.includes('FROM generations')) return genRow;
      return null;
    });

    const res = await createGenerationWithIdempotency(userId, prompt, style, file, key);
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ idempotent: true, generation: genRow });
  });

  it('handles createIdempotency race -> re-check finds failed and returns 409', async () => {
    const key = 'k6';
    mockedDb.getIdempotency.mockReturnValueOnce(null);
    (mockedDb.createIdempotency as jest.Mock).mockImplementation(() => {
      throw new Error('unique constraint');
    });
    mockedDb.getIdempotency.mockReturnValueOnce({
      key,
      userId: null,
      generationId: null,
      status: 'failed',
      createdAt: '2025-01-06T00:00:00Z',
    });

    const res = await createGenerationWithIdempotency(userId, prompt, style, file, key);
    expect(res.code).toBe(409);
    expect(res.body).toHaveProperty('message');
  });

  it('happy path: calls createGenerationService, inserts generation and returns 201', async () => {
    const key = 'k7';
    const partial = {
      prompt,
      style,
      imageUrl: null,
      status: 'done',
      createdAt: 'ts',
    };

    // no existing idempotency
    mockedDb.getIdempotency.mockReturnValue(null);
    // createIdempotency succeeds
    mockedDb.createIdempotency.mockImplementation(() => undefined);
    // createGenerationService returns partial (skipInsert)
    mockedGen.createGenerationService.mockResolvedValue(partial as any);

    // run() (insert) - no error
    mockedDb.run.mockImplementation(() => undefined);

    // when called for last_insert_rowid()
    mockedDb.get.mockImplementation((q: string, params?: any[]) => {
      if (q.includes('last_insert_rowid')) return { id: 777 };
      if (q.includes('FROM generations')) {
        return { id: 777, userId, prompt, style, imageUrl: null, status: 'done', createdAt: 'ts' };
      }
      return null;
    });

    const res = await createGenerationWithIdempotency(userId, prompt, style, file, key);
    expect(res.code).toBe(201);
    expect(res.body).toHaveProperty('id', 777);
    expect(mockedDb.createIdempotency).toHaveBeenCalledWith(key, userId);
    expect(mockedGen.createGenerationService).toHaveBeenCalledWith(userId, prompt, style, file, { skipInsert: true });
    expect(mockedDb.markIdempotencyDone).toHaveBeenCalledWith(key, 777);
  });

  it('marks idempotency failed and returns 503 when createGenerationService throws ModelOverloadError', async () => {
    const key = 'k8';
    mockedDb.getIdempotency.mockReturnValue(null);
    mockedDb.createIdempotency.mockImplementation(() => undefined);

    const overloadErr = new (mockedGen.ModelOverloadError as any)('busy');
    mockedGen.createGenerationService.mockRejectedValue(overloadErr);

    const res = await createGenerationWithIdempotency(userId, prompt, style, file, key);
    expect(res.code).toBe(503);
    expect(res.body).toEqual({ message: 'Model overloaded' });
    expect(mockedDb.markIdempotencyFailed).toHaveBeenCalledWith(key);
  });

  it('marks idempotency failed and returns 500 when createGenerationService throws generic error', async () => {
    const key = 'k9';
    mockedDb.getIdempotency.mockReturnValue(null);
    mockedDb.createIdempotency.mockImplementation(() => undefined);

    mockedGen.createGenerationService.mockRejectedValue(new Error('boom'));

    const res = await createGenerationWithIdempotency(userId, prompt, style, file, key);
    expect(res.code).toBe(500);
    expect(res.body).toEqual({ message: 'Server error' });
    expect(mockedDb.markIdempotencyFailed).toHaveBeenCalledWith(key);
  });

  it('marks idempotency failed and returns 500 when DB insert fails', async () => {
    const key = 'k10';
    const partial = {
      prompt,
      style,
      imageUrl: null,
      status: 'done',
      createdAt: 'ts',
    };

    mockedDb.getIdempotency.mockReturnValue(null);
    mockedDb.createIdempotency.mockImplementation(() => undefined);
    mockedGen.createGenerationService.mockResolvedValue(partial as any);

    // simulate run (insert) throws
    mockedDb.run.mockImplementation(() => {
      throw new Error('insert failed');
    });

    const res = await createGenerationWithIdempotency(userId, prompt, style, file, key);
    expect(res.code).toBe(500);
    expect(res.body).toEqual({ message: 'Server error' });
    expect(mockedDb.markIdempotencyFailed).toHaveBeenCalledWith(key);
  });
});
