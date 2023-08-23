import { describe } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();
import { runTest } from './sharedTest';
import { TestApi } from './TestApi';
import { BetterSqlite3Driver } from '../src/driver/sqlite-driver';
import Database from 'better-sqlite3';
import loglevel from 'loglevel';
import { dbSchema } from './kysely-schema';

loglevel.setLevel(loglevel.levels.DEBUG);
const config = {
  database: '',
  logger: loglevel,
} as const;
const api = new TestApi({
  config,
  schema: dbSchema,
  driver: new BetterSqlite3Driver(new Database(':memory:'), config),
});

describe('BetterQqlite BetterSqliteApdater', () => {
  runTest(api);
});
