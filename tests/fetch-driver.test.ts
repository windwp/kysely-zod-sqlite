import { afterAll, beforeAll, describe } from 'vitest';
import { handler } from '../src/driver/sqlite-driver';
import fastify from 'fastify';
import dotenv from 'dotenv';
dotenv.config();
import { runTest } from './sharedTest';
import { TestApi } from './TestApi';
import { FetchDriver } from '../src/driver/fetch-driver';
import loglevel from 'loglevel';
import { DbConfig } from '../src/types';
import { dbSchema } from './kysely-schema';
import Database from 'better-sqlite3';

loglevel.setLevel((process.env.DEBUG_LEVEL || loglevel.levels.DEBUG) as any);

const PORT = 9010;
const config: DbConfig = {
  apiKey: 'test',
  apiUrl: `http://localhost:${PORT}/api/v1`,
  database: 'Test',
  logger: loglevel,
};
const api = new TestApi({
  config,
  schema: dbSchema,
  driver: new FetchDriver(config),
});

const server = fastify({
  logger: true,
  disableRequestLogging: true,
});
describe('FetchDriver', () => {
  beforeAll(async () => {
    const db = new Database(':memory:');

    server.post('/api/v1', async (req, res) => {
      const body = req.body as any;
      const result = handler(db, body);
      res.header('Content-Type', 'application/json');
      res.send(result);
    });

    await server.listen({
      host: '0.0.0.0',
      port: PORT,
    });
    console.log(`server listening on port ${PORT}`);
  });
  afterAll(async () => {
    await server.close();
  });
  runTest(api);
});
