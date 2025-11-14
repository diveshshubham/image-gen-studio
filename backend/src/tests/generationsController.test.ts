// tests/controllers/generationsController.test.ts
import { createGeneration, listGenerations } from '../../src/controllers/generationsController';
import * as genService from '../../src/services/generationService';
import * as idemService from '../../src/services/idempotencyService';
import logger from '../../src/utils/logger';

jest.mock('../../src/services/generationService');
jest.mock('../../src/services/idempotencyService');
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

function makeRes() {
  const json = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json, _status: status, _json: json } as any;
}

describe('generationsController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('createGeneration controller', () => {
    it('returns 201 with generation on success (via idempotency service)', async () => {
      const req: any = {
        userId: 10,
        body: { prompt: 'p', style: 's' },
        headers: {}, // <- ensure headers exists
      };
      const res = makeRes();

      const generation = {
        id: 55,
        prompt: 'p',
        style: 's',
        imageUrl: null,
        status: 'done',
        createdAt: 't',
      };

      (idemService.createGenerationWithIdempotency as jest.Mock).mockResolvedValue({
        code: 201,
        body: generation,
      });

      await createGeneration(req, res);

      expect(idemService.createGenerationWithIdempotency).toHaveBeenCalledWith(
        10,
        'p',
        's',
        undefined,
        undefined
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res._json).toHaveBeenCalledWith(expect.objectContaining({ id: 55 }));
    });

    it('forwards idempotency key from header to service', async () => {
      const req: any = {
        userId: 11,
        body: { prompt: 'hello', style: 'art' },
        headers: { 'idempotency-key': 'abc-123' },
      };
      const res = makeRes();

      const generation = { id: 99, prompt: 'hello', style: 'art', imageUrl: null, status: 'done', createdAt: 't2' };

      (idemService.createGenerationWithIdempotency as jest.Mock).mockResolvedValue({
        code: 201,
        body: generation,
      });

      await createGeneration(req, res);

      expect(idemService.createGenerationWithIdempotency).toHaveBeenCalledWith(
        11,
        'hello',
        'art',
        undefined,
        'abc-123'
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res._json).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }));
    });

    it('returns error when ModelOverloadError thrown by idempotency service', async () => {
      const req: any = {
        userId: 4,
        body: { prompt: 'x', style: 'y' },
        headers: { 'idempotency-key': 'abc-123' },
      };
      const res = makeRes();

      const e = new (genService.ModelOverloadError as any)();
      (idemService.createGenerationWithIdempotency as jest.Mock).mockRejectedValue(e);

      await createGeneration(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('returns 400 when missing prompt or style', async () => {
      const req: any = { userId: 4, body: { prompt: '', style: '' }, headers: {} };
      const res = makeRes();

      await createGeneration(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._json).toHaveBeenCalledWith({ message: 'Missing prompt or style' });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns 500 on unexpected error from idempotency service', async () => {
      const req: any = { userId: 6, body: { prompt: 'p', style: 's' }, headers: {} };
      const res = makeRes();

      (idemService.createGenerationWithIdempotency as jest.Mock).mockRejectedValue(new Error('boom'));

      await createGeneration(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res._json).toHaveBeenCalledWith({ message: 'Server error' });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('listGenerations controller', () => {
    it('returns generations json on success', async () => {
      const req: any = { userId: 8, query: { limit: '2' } };
      const res = makeRes();

      (genService.listGenerationsService as jest.Mock).mockReturnValue([
        { id: 1, prompt: 'a', style: 's', imageUrl: null, status: 'done', createdAt: 't1' },
      ]);

      await listGenerations(req, res);

      expect(genService.listGenerationsService).toHaveBeenCalledWith(8, 2);
      expect(res._json).toHaveBeenCalledWith(expect.any(Array));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('listGenerations returned 1 rows for user=8'));
    });

    it('returns 500 on error', async () => {
      const req: any = { userId: 8, query: {} };
      const res = makeRes();

      (genService.listGenerationsService as jest.Mock).mockImplementation(() => { throw new Error('db'); });

      await listGenerations(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res._json).toHaveBeenCalledWith({ message: 'Server error' });
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
