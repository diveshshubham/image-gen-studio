// tests/db.test.ts
import fs from 'fs';
import path from 'path';

// Make Jest module mocks before importing the module under test
const prepareMock = jest.fn();
const stmtRunMock = jest.fn();
const stmtBindMock = jest.fn();
const stmtStepMock = jest.fn();
const stmtGetAsObjectMock = jest.fn();
const stmtGetMock = jest.fn();
const stmtFreeMock = jest.fn();
const dbRunMock = jest.fn();
const dbExportMock = jest.fn();
const dbCloseMock = jest.fn();

const fakeStmtFactory = (behavior?: {
  steps?: any[]; // array of {stepReturn:boolean, row?: any, raw?: any}
}) => {
  let stepCalls = 0;
  stmtRunMock.mockClear();
  stmtBindMock.mockClear();
  stmtStepMock.mockImplementation(() => {
    const def = behavior?.steps?.[stepCalls];
    stepCalls++;
    return Boolean(def?.stepReturn);
  });
  stmtGetAsObjectMock.mockImplementation(() => {
    const def = behavior?.steps?.[stepCalls - 1];
    return def?.row ?? {};
  });
  stmtGetMock.mockImplementation(() => {
    const def = behavior?.steps?.[stepCalls - 1];
    return def?.raw ?? [];
  });
  stmtFreeMock.mockImplementation(() => {});
  // return the fake statement object
  return {
    run: (p?: any) => {
      stmtRunMock(p);
    },
    bind: (p?: any) => {
      stmtBindMock(p);
    },
    step: () => stmtStepMock(),
    getAsObject: () => stmtGetAsObjectMock(),
    get: () => stmtGetMock(),
    free: () => stmtFreeMock(),
    // for getColumnNames if needed in future
    getColumnNames: () => [],
  };
};

const fakeDBFactory = (opts?: { prepareBehavior?: any[]; exported?: Uint8Array | number[] }) => {
  const behaviors = opts?.prepareBehavior ?? [];

  // reset mocks
  dbRunMock.mockClear();
  dbExportMock.mockClear();
  dbCloseMock.mockClear();

  let prepareCallIndex = 0;
  const db = {
    prepare: (sql: string) => {
      const behavior = behaviors[prepareCallIndex++] ?? {};
      return fakeStmtFactory(behavior);
    },
    run: (sql: string) => {
      dbRunMock(sql);
    },
    export: () => {
      dbExportMock();
      // return Uint8Array like sql.js does
      const arr = opts?.exported ?? [1, 2, 3];
      return new Uint8Array(arr as any);
    },
    close: () => {
      dbCloseMock();
    },
  };
  return db;
};

// Mock initSqlJs to return our fake SQL module
jest.mock('sql.js', () => {
  return jest.fn().mockImplementation(() => {
    return {
      Database: function (arg?: any) {
        // The tests will set up a particular fake DB by setting
        // (globalThis as any)._testFakeDb beforehand.
        return (globalThis as any)._testFakeDb;
      },
    };
  });
});

// Mock fs so we don't touch the real filesystem
jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return {
    ...real,
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

describe('backend/src/db', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    // default fs behaviors (can be overridden in tests)
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.readFileSync as jest.Mock).mockImplementation(() => Buffer.from([]));
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
  });

  it('initDb should create an in-memory DB when NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    // provide fake DB instance
    (globalThis as any)._testFakeDb = fakeDBFactory({
      prepareBehavior: [{ steps: [{ stepReturn: false }] }],
    });

    const { initDb } = await import('../models/db');
    const db = await initDb();
    expect(db).toBe((globalThis as any)._testFakeDb);

    // calling initDb again should return same instance and not recreate
    const db2 = await initDb();
    expect(db2).toBe(db);
  });

  it('run should prepare and run statement and persist via saveDb', async () => {
    process.env.NODE_ENV = 'test';
    (globalThis as any)._testFakeDb = fakeDBFactory();

    const dbMod = await import('../models/db');
    const { initDb, run } = dbMod;
    await initDb();

    // provide a prepare behavior where run() is expected to be called
    // we don't need step/get for run; just ensure stmt.run invoked
    const stmt = fakeStmtFactory();
    // temporarily override prepare to return our stmt
    (globalThis as any)._testFakeDb.prepare = jest.fn().mockReturnValue(stmt);

    run('INSERT INTO foo (a) VALUES (?)', [1]);
    // expect stmt.run called with params
    expect(stmtRunMock).toHaveBeenCalledWith([1]);
    // saveDb should call fs.writeFileSync when DB_PATH is file-based, but in test mode it's memory so nothing required
  });

  it('all should return rows from statement getAsObject', async () => {
    process.env.NODE_ENV = 'test';
    // prepare behavior: one step that returns a row object, then step false
    (globalThis as any)._testFakeDb = fakeDBFactory({
      prepareBehavior: [{ steps: [{ stepReturn: true, row: { id: 1, name: 'x' } }, { stepReturn: false }] }],
    });

    const dbMod = await import('../models/db');
    const { initDb, all } = dbMod;
    await initDb();

    // override prepare to use our fake behaviour
    (globalThis as any)._testFakeDb.prepare = jest.fn().mockImplementation((sql: string) => {
      return fakeStmtFactory({ steps: [{ stepReturn: true, row: { id: 1, name: 'x' } }, { stepReturn: false }] });
    });

    const rows = all('SELECT id, name FROM foo', []);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]).toEqual({ id: 1, name: 'x' });
  });

  it('get should return single row or null', async () => {
    process.env.NODE_ENV = 'test';
    (globalThis as any)._testFakeDb = fakeDBFactory();

    const dbMod = await import('../models/db');
    const { initDb, get } = dbMod;
    await initDb();

    // case: row exists
    const stmtWithRow = fakeStmtFactory({ steps: [{ stepReturn: true, row: { id: 5 } }] });
    (globalThis as any)._testFakeDb.prepare = jest.fn().mockReturnValue(stmtWithRow);
    const row = get('SELECT id FROM foo WHERE id = ?', [5]);
    expect(row).toEqual({ id: 5 });

    // case: no row
    const stmtNoRow = fakeStmtFactory({ steps: [{ stepReturn: false }] });
    (globalThis as any)._testFakeDb.prepare = jest.fn().mockReturnValue(stmtNoRow);
    const row2 = get('SELECT id FROM foo WHERE id = ?', [999]);
    expect(row2).toBeNull();
  });

  it('close should close and reset internal state', async () => {
    process.env.NODE_ENV = 'test';
    (globalThis as any)._testFakeDb = fakeDBFactory({ exported: [9, 8, 7] });

    const dbMod = await import('../models/db');
    const { initDb, close } = dbMod;
    await initDb();

    // set a spy for db.close to be observed
    (globalThis as any)._testFakeDb.close = jest.fn().mockImplementation(() => {});

    close();
    // after close, calling initDb should create a fresh DB instance again
    expect((globalThis as any)._testFakeDb.close).toHaveBeenCalled();
    // re-init should recreate DB (we set global test DB again)
    (globalThis as any)._testFakeDb = fakeDBFactory();
    const db2 = await initDb();
    expect(db2).toBe((globalThis as any)._testFakeDb);
  });
});
