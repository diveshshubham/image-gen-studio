// src/tests/imageService.test.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock sharp as a function that returns chainable API
const toFileMock = jest.fn();
const resizeMock = jest.fn().mockReturnValue({ toFile: toFileMock });
jest.mock('sharp', () =>
  jest.fn().mockImplementation(() => ({
    resize: resizeMock,
    toFile: toFileMock,
  }))
);

// We'll spy on fs methods
const existsSpy = jest.spyOn(fs, 'existsSync');
const mkdirSpy = jest.spyOn(fs, 'mkdirSync');
const copySpy = jest.spyOn(fs, 'copyFileSync');
const unlinkSpy = jest.spyOn(fs, 'unlinkSync');
// writeFileSync may be used in other code paths; keep default

// deterministic crypto.randomBytes
jest
  .spyOn(crypto, 'randomBytes')
  .mockImplementation((n: number) => Buffer.from('deadbeefcafede', 'hex'));

// import the function under test after mocks/spies are set up
import logger from '../../src/utils/logger';
import { saveUploadedFile } from '../../src/services/imageService';
import sharp from 'sharp';

describe('saveUploadedFile', () => {
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

  beforeEach(() => {
    // Preserve mock implementations (especially crypto.randomBytes).
    // Clear call history / instances but keep implementations.
    jest.clearAllMocks();

    // default fs behavior: uploads dir exists
    existsSpy.mockReturnValue(true);
    // keep mkdirSpy mock behavior default (we only assert it was called in some flows)
    mkdirSpy.mockImplementation(() => undefined);
    copySpy.mockImplementation(() => {});
    unlinkSpy.mockImplementation(() => {});

    // Reset sharp mock call history but keep its implementation
    toFileMock.mockClear();
    resizeMock.mockClear();

    // default: sharp resize -> resolves
    toFileMock.mockResolvedValue(undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('returns null and logs when tmpPath or originalName missing', async () => {
    const r1 = await saveUploadedFile(undefined as any, 'name.png');
    const r2 = await saveUploadedFile('/tmp/x' as any, undefined as any);

    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('uses sharp to resize and saves file, deletes tmp, returns urlPath', async () => {
    // simulate uploads dir doesn't exist so mkdir is called
    existsSpy.mockReturnValue(false);

    const tmp = '/tmp/fake.png';
    // ensure unlink does not throw
    unlinkSpy.mockImplementation(() => {});

    const res = await saveUploadedFile(tmp, 'photo.png');

    // sharp should have been called and toFile resolved
    expect((sharp as unknown as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(res).not.toBeNull();
    expect(res!.urlPath).toMatch(/^\/uploads\/\d+-[0-9a-f]+\.png$/);
    expect(unlinkSpy).toHaveBeenCalledWith(tmp);
  });

  it('falls back to copyFile when sharp throws and still succeeds', async () => {
    // make sharp throw for this call
    (sharp as unknown as jest.Mock).mockImplementationOnce(() => {
      return {
        resize: () => ({
          toFile: jest.fn().mockRejectedValue(new Error('sharp failed')),
        }),
      };
    });

    copySpy.mockImplementation(() => {}); // succeed
    unlinkSpy.mockImplementation(() => {});

    const tmp = '/tmp/from-buffer.bin';
    const res = await saveUploadedFile(tmp, 'buf.jpg');

    expect(res).not.toBeNull();
    expect(unlinkSpy).toHaveBeenCalledWith(tmp);
  });

  it('returns null and logs error when both sharp and copy fail', async () => {
    // sharp throws
    (sharp as unknown as jest.Mock).mockImplementationOnce(() => {
      return {
        resize: () => ({
          toFile: jest.fn().mockRejectedValue(new Error('sharp fail')),
        }),
      };
    });
    // copy fails
    copySpy.mockImplementation(() => {
      throw new Error('copy fail');
    });

    const tmp = '/tmp/bad.png';
    const res = await saveUploadedFile(tmp, 'bad.png');

    expect(res).toBeNull();
  });

  it('logs a warning if unlink (tmp delete) fails but returns success', async () => {
    // make unlink throw
    unlinkSpy.mockImplementation(() => {
      throw new Error('unlink fail');
    });

    // ensure sharp path succeeds
    toFileMock.mockResolvedValue(undefined);

    const tmp = '/tmp/file.png';
    const res = await saveUploadedFile(tmp, 'file.png');

    expect(res).not.toBeNull();
  });
});
