// tests/services/generationService.test.ts
import fs from 'fs';
import { saveUploadedFile } from '../../src/services/imageService';
import logger from '../../src/utils/logger';

// mock the new db helper module
jest.mock('../../src/models/db', () => ({
  initDb: jest.fn(),
  run: jest.fn(),
  get: jest.fn(),
  all: jest.fn(),
}));

jest.mock('../../src/services/imageService');
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import { initDb, run, get, all } from '../../src/models/db';
import {
  createGenerationService,
  listGenerationsService,
  ModelOverloadError,
} from '../../src/services/generationService';

jest.setTimeout(20000); // increase Jest timeout for slower CI/machines

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
      // Use modern fake timers so async timer helpers (advanceTimersByTimeAsync) work correctly
      jest.useFakeTimers({ legacyFakeTimers: false });
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('creates generation successfully when file.path exists and saveUploadedFile returns path', async () => {
      // saveUploadedFile resolves to a string path
      (saveUploadedFile as jest.Mock).mockResolvedValue('/uploads/img.png');

      // ensure initDb is called and run/get behave
      (initDb as jest.Mock).mockResolvedValue(undefined);
      (run as jest.Mock).mockImplementation(() => undefined);

      // get('SELECT last_insert_rowid() as id') returns inserted id
      (get as jest.Mock).mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('last_insert_rowid')) return { id: 123 };
        return null;
      });

      // create a fake multer file with path
      const file: any = {
        originalname: 'photo.png',
        path: '/tmp/uploaded-photo.png',
      };

      const p = createGenerationService(7, 'a prompt', 'stylized', file);
      // advance timers to let the simulated delay resolve (async helper)
      await jest.advanceTimersByTimeAsync(2000);
      const res = await p;

      // Assertions
      expect(initDb).toHaveBeenCalled();
      expect(saveUploadedFile).toHaveBeenCalledWith('/tmp/uploaded-photo.png', 'photo.png');

      // run should have been called with the INSERT and params
      const insertCall = (run as jest.Mock).mock.calls.find((c: any[]) =>
        String(c[0]).toLowerCase().includes('insert into generations')
      );
      expect(insertCall).toBeDefined();

      const params = insertCall![1];
      // assert fields individually to avoid brittle full-array equality (createdAt is dynamic)
      expect(params[0]).toBe(7);
      expect(params[1]).toBe('a prompt');
      expect(params[2]).toBe('stylized');
      expect(params[3]).toBe('/uploads/img.png'); // imageUrl slot
      expect(params[4]).toBe('done');
      expect(typeof params[5]).toBe('string'); // createdAt

      expect(res).toMatchObject({
        id: 123,
        prompt: 'a prompt',
        style: 'stylized',
        imageUrl: '/uploads/img.png',
        status: 'done',
      });

      // logger info should have been called mentioning file saved
      expect((logger.info as jest.Mock).mock.calls.some((c: any[]) =>
        String(c[0]).includes('File saved successfully')
      )).toBeTruthy();
    });

    it('creates generation successfully when file.buffer provided (no path)', async () => {
      // Ensure randomOverload() does NOT trigger by forcing Math.random() > 0.2
      const mathSpy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
    
      try {
        (saveUploadedFile as jest.Mock).mockResolvedValue('/uploads/buffered.png');
    
        (initDb as jest.Mock).mockResolvedValue(undefined);
        (run as jest.Mock).mockImplementation(() => undefined);
        (get as jest.Mock).mockImplementation((sql: string) => {
          if (typeof sql === 'string' && sql.includes('last_insert_rowid')) return { id: 999 };
          return null;
        });
    
        const file: any = {
          originalname: 'buf.jpg',
          buffer: Buffer.from('abc'),
        };
    
        const p = createGenerationService(3, 'p', 's', file);
        await jest.advanceTimersByTimeAsync(2000);
        const res = await p;
    
        expect(saveUploadedFile).toHaveBeenCalled();
    
        const insertCall = (run as jest.Mock).mock.calls.find((c: any[]) =>
          String(c[0]).toLowerCase().includes('insert into generations')
        );
        expect(insertCall).toBeDefined();
    
        const params = insertCall![1];
        expect(params[0]).toBe(3);
        expect(params[1]).toBe('p');
        expect(params[2]).toBe('s');
        expect(params[3]).toBe('/uploads/buffered.png'); // imageUrl slot
        expect(params[4]).toBe('done');
        expect(typeof params[5]).toBe('string'); // createdAt exists
    
        expect(res.id).toBe(999);
    
        // logger info should contain file saved info
        expect((logger.info as jest.Mock).mock.calls.some((c: any[]) =>
          String(c[0]).includes('File saved successfully') || String(c[0]).includes('Buffered file saved successfully')
        )).toBeTruthy();
      } finally {
        mathSpy.mockRestore();
      }
    });
    
 
    
  });

  describe('listGenerationsService', () => {
    it('returns rows limited and logs', async () => {
      const rows = [
        { id: 1, prompt: 'a', style: 's', imageUrl: null, status: 'done', createdAt: 't1' },
        { id: 2, prompt: 'b', style: 's2', imageUrl: '/u/2', status: 'done', createdAt: 't2' },
      ];
      (initDb as jest.Mock).mockResolvedValue(undefined);
      (all as jest.Mock).mockReturnValue(rows);

      const result = await listGenerationsService(11, 5);

      expect(all).toHaveBeenCalled();
      expect(result).toEqual(rows);
      expect((logger.info as jest.Mock).mock.calls.some((c) => String(c[0]).includes('Fetched 2 generations for user 11'))).toBeTruthy();
    });

    it('throws and logs on DB error', async () => {
      const err = new Error('db boom');
      (initDb as jest.Mock).mockResolvedValue(undefined);
      (all as jest.Mock).mockImplementation(() => {
        throw err;
      });

      await expect(listGenerationsService(2, 3)).rejects.toThrow(err);
      expect((logger.error as jest.Mock).mock.calls[0][0]).toEqual(expect.stringContaining('Error listing generations for user 2'));
    });
  });
});
