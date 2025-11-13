import { createGeneration, listGenerations } from '../../src/controllers/generationsController';
import * as service from '../../src/services/generationService';
import logger from '../../src/utils/logger';

jest.mock('../../src/services/generationService');
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
    it('returns 201 with generation on success', async () => {
      const req: any = {
        userId: 10,
        body: { prompt: 'p', style: 's' },
      };
      const res = makeRes();

      (service.createGenerationService as jest.Mock).mockResolvedValue({
        id: 55,
        prompt: 'p',
        style: 's',
        imageUrl: null,
        status: 'done',
        createdAt: 't',
      });

      await createGeneration(req, res);

      expect(service.createGenerationService).toHaveBeenCalledWith(10, 'p', 's', undefined);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res._json).toHaveBeenCalledWith(expect.objectContaining({ id: 55 }));
    });

    it('returns 503 when ModelOverloadError thrown', async () => {
      const req: any = { userId: 4, body: { prompt: 'x', style: 'y' } };
      const res = makeRes();

      const e = new service.ModelOverloadError();
      (service.createGenerationService as jest.Mock).mockRejectedValue(e);

      await createGeneration(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res._json).toHaveBeenCalledWith({ message: 'Model overloaded' });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns 400 when missing prompt or style', async () => {
      const req: any = { userId: 4, body: { prompt: '', style: '' } };
      const res = makeRes();

      await createGeneration(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._json).toHaveBeenCalledWith({ message: 'Missing prompt or style' });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns 500 on unexpected error', async () => {
      const req: any = { userId: 6, body: { prompt: 'p', style: 's' } };
      const res = makeRes();

      (service.createGenerationService as jest.Mock).mockRejectedValue(new Error('boom'));

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

      (service.listGenerationsService as jest.Mock).mockReturnValue([
        { id: 1, prompt: 'a', style: 's', imageUrl: null, status: 'done', createdAt: 't1' },
      ]);

      await listGenerations(req, res);

      expect(service.listGenerationsService).toHaveBeenCalledWith(8, 2);
      expect(res._json).toHaveBeenCalledWith(expect.any(Array));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('listGenerations returned 1 rows for user=8'));
    });

    it('returns 500 on error', async () => {
      const req: any = { userId: 8, query: {} };
      const res = makeRes();

      (service.listGenerationsService as jest.Mock).mockImplementation(() => { throw new Error('db'); });

      await listGenerations(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res._json).toHaveBeenCalledWith({ message: 'Server error' });
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
