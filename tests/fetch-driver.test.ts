import { afterAll, describe, vi } from 'vitest';
import { handler } from '../src/driver/sqlite-driver';
import { getDb, runTest } from './sharedTest';
import { TestApi } from './TestApi';
import { FetchDriver } from '../src/driver/fetch-driver';
import loglevel from 'loglevel';
import { dbSchema } from './kysely-schema';

const api = new TestApi({
  config: { logger: loglevel },
  schema: dbSchema,
  driver: new FetchDriver({
    apiKey: 'test',
    apiUrl: 'http://localhost:3000/api/v1',
    logger: loglevel,
  }),
});

const db = getDb();

vi.stubGlobal('fetch', (_: any, options: any) => {
  try {
    const data = handler(db, JSON.parse(options?.body as string));
    return Promise.resolve({
      json: () => new Promise(resolve => resolve(data)),
      ok: true,
    } as any);
  } catch (error: any) {
    loglevel.error('Fetch ================');
    loglevel.error(error);
    throw error;
  }
});
describe('FetchDriver', () => {
  afterAll(() => {
    vi.resetAllMocks();
  });
  runTest(api);
});
