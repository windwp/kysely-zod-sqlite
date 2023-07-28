import { beforeAll, beforeEach, expect, it } from 'vitest';
import { TestApi } from './TestApi';
import { sql } from 'kysely';
import { uid } from 'uid';
import { UserTable } from './kysely-schema';
import { addDays, startOfDay } from 'date-fns';

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
      updatedAt: startOfDay(addDays(new Date(), i)),
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
  api.config.logger?.setLevel('debug');
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
      .addColumn('email', 'boolean', cb => cb.unique())
      .addColumn('data', 'text')
      .addColumn('createdAt', 'datetime', cb =>
        cb.defaultTo(sql`CURRENT_TIMESTAMP`)
      )
      .addColumn('updatedAt', 'datetime', cb =>
        cb.defaultTo(sql`CURRENT_TIMESTAMP`)
      )
      .execute();
    await api.db.schema
      .createTable('TestPost')
      .ifNotExists()
      .addColumn('id', 'text', cb => cb.primaryKey())
      .addColumn('name', 'text')
      .addColumn('isPublished', 'boolean', cb => cb.defaultTo(false))
      .addColumn('data', 'text')
      .addColumn('userId', 'text')
      .addColumn('createdAt', 'datetime', cb =>
        cb.defaultTo(sql`CURRENT_TIMESTAMP`)
      )
      .addColumn('updatedAt', 'datetime', cb =>
        cb.defaultTo(sql`CURRENT_TIMESTAMP`)
      )
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
    const check = await api.TestPost.selectMany({
      take: 2,
    });
    expect(check[0].isPublished).toBe(true);
    expect(check[1].isPublished).toBe(false);
    const check2 = await api.TestPost.selectMany({
      where: {
        isPublished: false,
      },
    });
    expect(check2.length).toBe(5);
    const check3 = await api.TestPost.selectMany({
      where: {
        isPublished: true,
      },
    });
    expect(check3.length).toBe(5);
  });

  it('should be able to do a crud on kysely', async () => {
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
        updatedAt: new Date(),
      })
      .executeTakeFirst();
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
      expect(check.createdAt instanceof Date).toBeTruthy();
      expect(check.updatedAt instanceof Date).toBeTruthy();
    }
    {
      const check = await api.TestUser.insertOne({
        name: 'check',
        email: 'usercheck@gmail.com',
        updatedAt: new Date(),
      });
      expect(check.id).toBeTruthy();
      expect(check.id?.startsWith('u_')).toBeTruthy();
      expect(check.createdAt instanceof Date).toBeTruthy();
      expect(check.updatedAt instanceof Date).toBeTruthy();
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
        updatedAt: 'desc',
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
      await api.batchOneSmt(sql`update TestUser set name = ? where id = ?`, [
        ['user2', userArr[0].id],
      ]);
    }
    {
      const result = await api.batchAllSmt([
        api.db.selectFrom('TestUser').selectAll(),
        api.db.insertInto('TestPost').values({
          id: uid(),
          name: 'post',
          data: '',
          isPublished: true,
          userId: userArr[0].id,
        }),
      ]);
      const users = result.getMany<UserTable>(0);
      expect(users.length).toBe(10);
      const post = result.getOne<any>(1);
      expect(post.changes).toBe(1);
    }
  });
  it('bulks should working', async () => {
    {
      const check = await api.bulk({
        user: api.$batchOneSmt(
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
        ),
        topUser: api.TestUser.$selectMany({
          take: 10,
          include: {
            posts: true,
          },
        }),
        check: undefined,
      });
      const topUser = check.getMany<UserTable>('topUser');
      expect(topUser.length).toBe(10);
      expect(topUser[0].posts).toBeTruthy();
      expect(topUser[0].posts?.[0]?.id).toBeTruthy();
    }
  });

  it('should  compare date', async () => {
    const check = await api.db
      .selectFrom('TestUser')
      .selectAll()
      .where('updatedAt', '>=', addDays(new Date(), 3))
      .execute();
    expect(check.length).toBe(6);
  });

  it('select where undefined is skip', async () => {
    const first = await api.TestUser.selectFirst({
      where: {
        name: undefined,
        id: userArr[0].id,
      },
      select: ['id', 'name'],
    });
    expect(first).toBeTruthy();
    expect(first?.name).toBeTruthy();
    expect(first?.data).toBeFalsy();
  });

  it('updateOne should working', async () => {
    const all = await api.TestUser.selectMany({
      where: {
        name: {
          like: 'user%',
        },
      },
    });
    expect(all.length).toBe(10);
    await api.TestUser.updateOne({
      where: {
        name: {
          like: 'user%',
        },
      },
      data: {
        name: 'check',
      },
    });
    const check = await api.TestUser.selectMany({
      where: { name: 'check' },
    });
    expect(check.length).toBe(1);
  });

  it('insertConflict', async () => {
    const check = await api.TestUser.insertConflict({
      create: {
        name: 'check',
        email: 'test@gmail.com',
      },
      update: {
        name: 'test',
      },
      conflicts: ['email'],
    });
    await api.TestUser.insertConflict({
      create: {
        name: 'check',
        email: 'test@gmail.com',
      },
      update: {
        name: 'test2',
      },
      conflicts: ['email'],
    });
    const check2 = await api.TestUser.selectMany({
      where: {
        email: 'test@gmail.com',
      },
    });
    expect(check2.length).toBe(1);
    expect(check2[0].id).toBe(check.id);
  });
}
