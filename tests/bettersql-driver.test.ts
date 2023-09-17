import { describe } from 'vitest';
import { getDb, runTest } from './sharedTest';
import { TestApi } from './TestApi';
import { BetterSqlite3Driver } from '../src/driver/sqlite-driver';
import loglevel from 'loglevel';
import { dbSchema } from './kysely-schema';

loglevel.setLevel(loglevel.levels.DEBUG);
const config = {
  database: '',
  logger: loglevel,
};
const api = new TestApi({
  config,
  schema: dbSchema,
  driver: new BetterSqlite3Driver(getDb(), config),
});

describe('BetterQqlite BetterSqliteApdater', () => {
  runTest(api);
});
