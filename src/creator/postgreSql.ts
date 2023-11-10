import { ZodObject } from 'zod';
import { Driver, Kysely, PostgresDialect } from 'kysely';
import { Logger } from 'loglevel';
import { ZodSchemaToKysely } from '../types';

export function createKyselyPostgreSql<
  Schema extends ZodObject<any, any, any>
>(ctx: {
  driver: Driver;
  logger?: Logger;
  schema: Schema;
}): Kysely<ZodSchemaToKysely<Schema>> {
  return new Kysely({
    dialect: new PostgresDialect({
    }),
    plugins: [],
  });
}
