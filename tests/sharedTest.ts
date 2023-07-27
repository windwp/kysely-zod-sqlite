import { beforeAll, beforeEach, expect, it } from 'vitest';
import { TestApi } from './TestApi';
import { sql } from 'kysely';
import { uid } from 'uid';
import { UserTable } from './kysely-schema';
import { addDays } from 'date-fns';

async function textFixture(api: TestApi) {
  api.config.logger?.setLevel('silent');
  await api.TestUser.deleteMany({});
  await api.TestPost.deleteMany({});
  const userArr = Array.from({ length: 10 }).map((_, i) => {
    return {
      id: uid(),
      name: `user${i}`,
      email: `email${i}@gmail.com`,
      data: {
        value: `value${i}`,
        name: `name${i}`,
        o: { a: i },
      },
      updateAt: addDays(new Date(), i),
    };
  });
  await api.TestUser.insertMany(userArr);
  const postArr = Array.from({ length: 10 }).map((_, i) => {
    return {
      id: uid(),
      name: 'post',
      data: '',
      isPublished: i % 2 === 0,
      userId: userArr[i % 2].id,
    };
  });
  await api.TestPost.insertMany(postArr);
  api.config.logger?.setLevel('info');
  return { userArr, postArr };
}
export function runTest(api: TestApi) {
  let userArr: UserTable[];
  beforeAll(async () => {
    api.config.logger?.setLevel('silent');
    // await api.runSql(sql`PRAGMA foreign_keys=off`);
    // await api.runSql(sql`DROP TABLE TestUser`);
    // await api.runSql(sql`DROP TABLE TestPost`);
    await api.db.schema
      .createTable('TestUser')
      .ifNotExists()
      .addColumn('id', 'text', cb => cb.primaryKey())
      .addColumn('name', 'text')
      .addColumn('email', 'text', cb => cb.unique())
      .addColumn('data', 'text')
      .addColumn('updateAt', 'datetime', cb =>
        cb.defaultTo(sql`CURRENT_TIMESTAMP`)
      )
      .execute();
    await api.db.schema
      .createTable('TestPost')
      .ifNotExists()
      .addColumn('id', 'text', cb => cb.primaryKey())
      .addColumn('name', 'text')
      .addColumn('isPublished', 'text', cb => cb.defaultTo(false))
      .addColumn('data', 'text')
      .addColumn('userId', 'text')
      .addForeignKeyConstraint(
        'Post_userId_fkey',
        ['userId'],
        'TestUser',
        ['id'],
        cb => cb.onDelete('cascade')
      )
      .execute();
    // await api.runSql(sql`PRAGMA foreign_keys=on`);
  });
  beforeEach(async () => {
    const data = await textFixture(api);
    userArr = data.userArr;
  });

  it('value type boolean should work', async () => {
    const first = await api.TestPost.selectMany({
      take: 2,
    });
    expect(first[0].isPublished).toBe(true);
    expect(first[1].isPublished).toBe(false);
  });

  it('should be able to do a crud on kysely', async () => {
    // const insertModel = await api.run(
    const testId = '123456';
    await api.db
      .insertInto('TestUser')
      .values({
        id: testId,
        name: 'test',
        email: 'test@gmail.com',
        data: {
          value: 'value1',
          name: 'name1',
          o: {
            a: 10,
          },
        },
        updateAt: new Date(),
      } as any)
      .executeTakeFirst();
    // );
    const first = await api.db
      .selectFrom('TestUser')
      .where('id', '=', testId)
      .selectAll()
      .executeTakeFirst();

    expect(first?.data?.o.a).toBe(10);
    const check = await api.db
      .updateTable('TestUser')
      .set({ name: 'test' })
      .where('id', '=', testId)
      .executeTakeFirst();
    expect(check.numUpdatedRows).toBe(1);
  });

  it('short syntax should working', async () => {
    {
      const check = await api.TestUser.selectMany({
        where: {
          name: {
            like: 'user%',
          },
        },
        select: ['name', 'id'],
        skip: 2,
        take: 4,
      });
      expect(check.length).toBe(4);
      expect(check[0].id).toBe(userArr[2].id);
    }
    {
      const check = await api.TestUser.selectById(userArr[0].id);
      expect(check?.id).toBe(userArr[0].id);
    }
    {
      const postArr = Array.from({ length: 10 }).map((_, i) => {
        return {
          id: uid(),
          name: 'crudPost',
          data: '',
          userId: userArr[i % 2].id,
        };
      });
      await api.TestPost.insertMany(postArr);
      await api.TestPost.deleteMany({
        where: {
          name: 'crudPost',
          userId: userArr[0].id,
        },
      });
      const check = await api.TestPost.selectMany({
        where: {
          name: 'crudPost',
        },
      });
      expect(check.length).toBe(5);
      const data = await api.TestPost.updateMany({
        where: {
          name: 'crudPost',
        },
        data: {
          name: 'crudPost2',
          userId: userArr[0].id,
        },
      });
      expect(data.numUpdatedRows).toBe(5);
    }
  });

  it('sort working', async () => {
    const check = await api.TestUser.selectMany({
      where: {
        name: {
          like: 'user%',
        },
      },
      select: ['name', 'id'],
      skip: 2,
      take: 4,
      orderBy: {
        updateAt: 'desc',
      },
    });
    expect(check[0].id).toBe(userArr[7].id);
  });

  it('count working', async () => {
    const result = await api.TestPost.count({
      where: {
        name: 'post',
        userId: userArr[0].id,
      },
    });
    expect(result).toBe(5);
  });

  it('relationselect one', async () => {
    {
      const topPost = await api.TestPost.selectMany({
        take: 1,
      });
      expect(topPost[0]).toBeTruthy();

      const check = await api.TestPost.selectFirst({
        where: {
          id: topPost[0].id,
        },
        include: {
          user: true,
        },
      });
      expect(check?.user).toBeTruthy();
      expect(check?.user?.data).toBeTruthy();
    }
    {
      const check = await api.TestPost.selectMany({
        where: {
          name: {
            like: 'post%',
          },
          userId: userArr[0].id,
        },
        include: {
          user: true,
        },
      });
      expect(check.length).toBe(5);
      expect(check[0].user).toBeTruthy();
    }
  });

  it('relation select many working', async () => {
    const result = await api.TestUser.selectFirst({
      where: {
        id: userArr[0].id,
      },
      include: {
        posts: true,
      },
    });
    expect(result?.posts?.[0].userId).toBe(userArr[0].id);
  });

  it('batch should working', async () => {
    {
      await api.batchOneSmt(
        api.db
          .updateTable('TestUser')
          .set({
            data: sql` json_set(data, '$.value', ?)`,
          })
          .where('name', '=', '?'),
        [
          ['aaa', 'user0'],
          ['bbb', 'user1'],
        ]
      );

      const check0 = await api.TestUser.selectFirst({
        where: {
          name: 'user0',
        },
      });
      expect(check0?.data?.value).toBe('aaa');
    }
    {
      const result = await api.batchAllSmt([
        api.db.selectFrom('TestUser').selectAll(),
        api.db.insertInto('TestUser').values({
          id: '123',
          name: 'test',
          email: uid() + '@gmail.com',
        }),
      ]);
      const users = result.getMany<UserTable>(0);
      expect(users.length).toBe(10);
    }
  });
}
