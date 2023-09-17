import { describe, it } from 'vitest';
import dotenv from 'dotenv';
dotenv.config
import { runTest } from './sharedTest';
import { TestApi } from './TestApi';
import { FetchDriver } from '../src/driver/fetch-driver';
import loglevel from 'loglevel';
import { dbSchema } from './kysely-schema';

describe('FetchDriver', () => {
  if (process.env.API_URL) {
    const api = new TestApi({
      config: { logger: loglevel },
      schema: dbSchema,
      driver: new FetchDriver({
        apiKey: process.env.API_KEY!,
        apiUrl: process.env.API_URL!,
        logger: loglevel,
      }),
    });
    runTest(api);
  } else {
    it('should ', async () => {});
  }
});
