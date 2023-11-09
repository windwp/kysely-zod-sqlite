import { ZodObject } from 'zod';
import {
  Driver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely';
import { Logger } from 'loglevel';
import { ZodSchemaToKysely } from '../types';
import { SqliteSerializePlugin } from '../serialize/sqlite-serialize-plugin';

export function createKyselySqlite<
  Schema extends ZodObject<any, any, any>
>(ctx: {
  driver: Driver;
  logger?: Logger;
  schema: Schema;
}): Kysely<ZodSchemaToKysely<Schema>> {
  return new Kysely({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createIntrospector: o => new SqliteIntrospector(o),
      createQueryCompiler: () => new SqliteQueryCompiler(),
      createDriver: () => ctx.driver,
    },
    plugins: [
      new SqliteSerializePlugin({
        shape: ctx.schema.shape,
        logger: ctx.logger,
      }),
    ],
  });
}
