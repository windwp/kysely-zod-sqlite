import { describe } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();
import { runTest } from './sharedTest';
import { TestApi } from './TestApi';
import { BetterDriver } from '../src/driver/sqlite-driver';
import Database from 'better-sqlite3';
import loglevel from 'loglevel';
import { DbConfig } from '../src/types';
import { dbSchema } from './kysely-schema';

loglevel.setLevel((process.env.DEBUG_LEVEL || loglevel.levels.DEBUG) as any);
const config: DbConfig = {
  apiKey: '',
  apiUrl: '',
  database: '',
  logger: loglevel,
};
const api = new TestApi({
  config,
  schema: dbSchema,
  driver: new BetterDriver(new Database(':memory:'), config),
});

describe('BetterQqlite BetterSqliteApdater', () => {
  runTest(api);
});
