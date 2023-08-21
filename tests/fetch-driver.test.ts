import { afterAll, describe, vi } from 'vitest';
import { handler } from '../src/driver/sqlite-driver';
import dotenv from 'dotenv';
dotenv.config();
import { runTest } from './sharedTest';
import { TestApi } from './TestApi';
import { FetchDriver } from '../src/driver/fetch-driver';
import loglevel from 'loglevel';
import { dbSchema } from './kysely-schema';
import Database from 'better-sqlite3';

loglevel.setLevel(loglevel.levels.DEBUG);

const config = {};
const api = new TestApi({
  config,
  schema: dbSchema,
  driver: new FetchDriver({
    apiKey: 'test',
    apiUrl: 'http://localhost:3000/api/v1',
    database: 'Test',
    logger: loglevel,
  }),
});

const db = new Database(':memory:');

global.fetch = vi.fn((_, options) => {
  try {
    console.log('options?.body', options?.body);
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
