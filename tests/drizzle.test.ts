import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getDb } from './sharedTest';
import * as schema from './drizzle-schema';
import { eq, sql } from 'drizzle-orm';

const sqldb = getDb();
describe('test drizzle', () => {
  it('should drizzle', async () => {
    const db = drizzle(sqldb, {
      schema: schema,
    });
    const insertQuery = db
      .insert(schema.users)
      .values({
        id: crypto.randomUUID(),
        name: 'dasta',
        email: 'test@gmail.com',
        data: {
          value: 'daf',
          name: 'fdsafd',
        },
        config: {
          language: '123',
          status: '123',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    const check = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.name, 'dasta'));

    console.log(schema.users.id);
    console.log('check', check);
    // const query = insertQuery.toSQL();
    // await insertQuery.execute();
    // const check = await db.select().from(schema.users).execute();
    // db.select().from('users').where(eq('132', '321'));
    // console.log(eq(schema.users.id, 'dsfa'));
    // console.log(sql`${schema.users.id} = 42 and ${schema.users.name} = 'Dan'`);
    // console.log('check', check);
  });
});
