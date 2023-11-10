import { describe } from 'vitest';
import * as Cursor from 'pg-cursor';
import fs from 'fs';
import { Pool } from 'pg';
import { TestApi } from './TestApi';
import loglevel from 'loglevel';
import { dbSchema } from './kysely-schema';
import { Kysely, PostgresDialect } from 'kysely';
import { runTest } from './sharedTest';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';

loglevel.setLevel(loglevel.levels.DEBUG);
const pool = new Pool({
  database: 'kysely_test',
  host: 'localhost',
  user: 'kysely',
  port: 5434,
  max: 10,
});

const api = new TestApi({
  schema: dbSchema,
  config: { logger: loglevel },
  kysely: new Kysely({
    dialect: new PostgresDialect({
      pool: pool,
      cursor: Cursor as any,
    }),
    log: ['query'],
  }),
  jsonHelpers: {
    jsonArrayFrom,
    jsonObjectFrom,
  },
});
describe('postgresql', async () => {
  const connection = await pool.connect();
  const sql = fs.readFileSync('./sql/postgres.sql', 'utf8');
  await connection.query(sql);
  runTest(api, 'postgres');
});
