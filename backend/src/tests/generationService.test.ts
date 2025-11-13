// tests/services/generationService.test.ts
import db from '../../src/models/db';
import fs from 'fs';
import { saveUploadedFile } from '../../src/services/imageService';
import logger from '../../src/utils/logger';

jest.mock('../../src/models/db');
jest.mock('../../src/services/imageService');
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import {
  createGenerationService,
  listGenerationsService,
  ModelOverloadError,
} from '../../src/services/generationService';

describe('generationService', () => {
  let existsSpy: jest.SpyInstance;
  let mkdirSpy: jest.SpyInstance;
  let copySpy: jest.SpyInstance;
  let unlinkSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();

    // spy on fs functions used by the service
    existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    copySpy = jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});
    unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createGenerationService', () => {
    beforeAll(() => {
      jest.useFakeTimers();
    });
    afterAll(() => {
      jest.useRealTimers();
    });

    it('creates generation successfully when file.path exists and saveUploadedFile returns url', async () => {
      (saveUploadedFile as jest.Mock).mockResolvedValue({ urlPath: '/uploads/img.png' });

      // mock db prepare().run
      const runMock = jest.fn().mockReturnValue({ lastInsertRowid: 123 });
      (db.prepare as jest.Mock).mockReturnValue({ run: runMock });

      // create a fake multer file with path
      const file: any = {
        originalname: 'photo.png',
        path: '/tmp/uploaded-photo.png',
      };

      const p = createGenerationService(7, 'a prompt', 'stylized', file);
      jest.advanceTimersByTime(2000);
      const res = await p;

      // Assert
      expect(saveUploadedFile).toHaveBeenCalledWith('/tmp/uploaded-photo.png', 'photo.png');
      expect(runMock).toHaveBeenCalledWith(7, 'a prompt', 'stylized', '/uploads/img.png', 'done', expect.any(String));
      expect(res).toMatchObject({
        id: 123,
        prompt: 'a prompt',
        style: 'stylized',
        imageUrl: '/uploads/img.png',
        status: 'done',
      });
      expect((logger.info as jest.Mock).mock.calls[0][0]).toEqual(expect.stringContaining('File saved successfully: /uploads/img.png'));
    });

    it('creates generation successfully when file.buffer provided (no path)', async () => {
      (saveUploadedFile as jest.Mock).mockResolvedValue({ urlPath: '/uploads/buffered.png' });
      const runMock = jest.fn().mockReturnValue({ lastInsertRowid: 999 });
      (db.prepare as jest.Mock).mockReturnValue({ run: runMock });

      const file: any = {
        originalname: 'buf.jpg',
        buffer: Buffer.from('abc'),
      };

      const p = createGenerationService(3, 'p', 's', file);
      jest.advanceTimersByTime(2000);
      const res = await p;

      expect(saveUploadedFile).toHaveBeenCalled();
      expect(runMock).toHaveBeenCalledWith(3, 'p', 's', '/uploads/buffered.png', 'done', expect.any(String));
      expect(res.id).toBe(999);
      expect((logger.info as jest.Mock).mock.calls[0][0]).toEqual(expect.stringContaining('Buffered file saved successfully: /uploads/buffered.png'));
    });

    it('throws ModelOverloadError when random overload triggers', async () => {
        const mathSpy = jest.spyOn(Math, 'random').mockReturnValue(0.1); 
        (db.prepare as jest.Mock).mockReturnValue({ run: jest.fn() });
      
        const p = createGenerationService(1, 'x', 'y');
        jest.advanceTimersByTime(2000);
      
        await expect(p).rejects.toThrow(ModelOverloadError);
        expect((logger.warn as jest.Mock).mock.calls[0][0]).toEqual(expect.stringContaining('Model overload simulated'));
        mathSpy.mockRestore();
      });
      

    it('propagates file save error and logs', async () => {
        // Ensure overload DOES NOT happen
        const mathSpy = jest.spyOn(Math, 'random').mockReturnValue(0.9); // >0.2 so no overload
      
        (saveUploadedFile as jest.Mock).mockRejectedValue(new Error('save fail'));
        (db.prepare as jest.Mock).mockReturnValue({ run: jest.fn() });
      
        const file: any = { originalname: 'bad.png', path: '/tmp/bad.png' };
      
        const p = createGenerationService(5, 'q', 'r', file);
        jest.advanceTimersByTime(2000);
      
        await expect(p).rejects.toThrow('save fail');
      
        // now logger.error should have been called
        expect((logger.error as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
        expect((logger.error as jest.Mock).mock.calls[0][0]).toEqual(
          expect.stringContaining('Error saving uploaded file for user 5')
        );
      
        mathSpy.mockRestore();
      });
      
  });

  describe('listGenerationsService', () => {
    it('returns rows limited and logs', () => {
      const rows = [
        { id: 1, prompt: 'a', style: 's', imageUrl: null, status: 'done', createdAt: 't1' },
        { id: 2, prompt: 'b', style: 's2', imageUrl: '/u/2', status: 'done', createdAt: 't2' },
      ];
      const allMock = jest.fn().mockReturnValue(rows);
      (db.prepare as jest.Mock).mockReturnValue({ all: allMock });

      const result = listGenerationsService(11, 5);

      expect(allMock).toHaveBeenCalledWith(11, 5);
      expect(result).toEqual(rows);
      expect((logger.info as jest.Mock).mock.calls[0][0]).toEqual(expect.stringContaining('Fetched 2 generations for user 11'));
    });

    it('throws and logs on DB error', () => {
      const err = new Error('db boom');
      const allMock = jest.fn().mockImplementation(() => { throw err; });
      (db.prepare as jest.Mock).mockReturnValue({ all: allMock });

      expect(() => listGenerationsService(2, 3)).toThrow(err);
      expect((logger.error as jest.Mock).mock.calls[0][0]).toEqual(expect.stringContaining('Error listing generations for user 2'));
    });
  });
});
