import { describe } from 'vitest';
import { getDb, runTest } from './sharedTest';
import { TestApi } from './TestApi';
import { BetterSqlite3Driver } from '../src/driver/sqlite-driver';
import loglevel from 'loglevel';
import { dbSchema } from './kysely-schema';
import { createKyselySqlite } from '../src/creator/sqlite';

loglevel.setLevel(loglevel.levels.DEBUG);
const api = new TestApi({
  schema: dbSchema,
  config: { logger: loglevel },
  kysely: createKyselySqlite({
    driver: new BetterSqlite3Driver(getDb(), { logger: loglevel }),
    schema: dbSchema,
    logger: loglevel,
  }),
});

describe('BetterQqlite BetterSqliteApdater', () => {
  runTest(api);
});
