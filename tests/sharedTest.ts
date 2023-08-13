import { beforeAll, beforeEach, expect, it } from 'vitest';
import { TestApi } from './TestApi';
import { sql } from 'kysely';
import { UserTable } from './kysely-schema';
import { addDays, startOfDay } from 'date-fns';
import { z } from 'zod';
import { uid } from '../src';

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
    await api.ky.schema
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
    await api.ky.schema
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
    await api.ky.schema
      .createTable('TestNoId')
      .ifNotExists()
      .addColumn('userId', 'text')
      .addColumn('postId', 'text')
      .addColumn('sample', 'text')
      .addUniqueConstraint('userId_postId_unique', ['userId', 'postId'])
      .execute();

    // await api.runSql(sql`PRAGMA foreign_keys=on`);
  });
  beforeEach(async () => {
    const data = await textFixture(api);
    userArr = data.userArr;
  });

  it('value type boolean should work', async () => {
    const v = uid();
    expect(v.length).toBe(24);
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
    await api.ky
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
    const first = await api.ky
      .selectFrom('TestUser')
      .where('id', '=', testId)
      .selectAll()
      .executeTakeFirst();

    expect(first?.data?.o.a).toBe(10);
    const check = await api.ky
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
        select: {
          id: true,
          name: true,
        },
        skip: 2,
        take: 4,
      });
      expect(check.length).toBe(4);
      expect(check[0].id).toBe(userArr[2].id);
    }
    {
      const check = await api.TestUser.selectById(userArr[0].id);
      expect(check?.id).toBe(userArr[0].id);
      expect(check?.createdAt instanceof Date).toBeTruthy();
      expect(check?.updatedAt instanceof Date).toBeTruthy();
    }
    {
      const check = await api.TestUser.insertOne({
        name: 'check',
        email: 'usercheck@gmail.com',
        updatedAt: new Date(),
      });
      expect(check.id).toBeTruthy();
      expect(check.id?.length).toBe(24);
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
      select: { id: true, name: true },
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

  it('select with relation one', async () => {
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

  it('select relaton array working', async () => {
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

  it('batchone should working', async () => {
    {
      await api.batchOneSmt(
        api.ky
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
  });
  it('batchone with value is an object', async () => {
    const newUsers: Partial<UserTable>[] = ['user0', 'user1'].map(o => ({
      name: o,
      email: `${o}@gmail.com`,
      data: {
        name: '2',
        value: '',
        o: {
          a: 1,
        },
      },
    }));
    await api.batchOneSmt(
      api.ky.updateTable('TestUser').set(newUsers[0]).where('name', '=', '?'),
      newUsers.map(o => {
        return [...Object.values(o), o.name];
      })
    );
  });
  it('batchAll should work ', async () => {
    {
      const result = await api.batchAllSmt([
        api.ky.selectFrom('TestUser').selectAll(),
        api.ky.insertInto('TestPost').values({
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
          api.ky
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
          select: {
            id: true,
          },
        }),
        check: undefined,
      });
      const topUser = check.getMany<UserTable>('topUser');
      expect(topUser.length).toBe(10);
      const user = topUser.find(u => u.id == userArr[0].id);
      expect(user?.id).toBeTruthy();
      expect(user?.data).toBeFalsy();
      expect(user?.posts).toBeTruthy();
      expect(user?.posts?.[0]?.id).toBeTruthy();
      const value = check.getOne('check');
      expect(value).toBe(undefined);
    }
  });

  it('should compare date', async () => {
    const check = await api.ky
      .selectFrom('TestUser')
      .selectAll()
      .where('updatedAt', '>=', addDays(new Date(), 3))
      .execute();
    expect(check.length).toBe(6);
  });

  it('select where will ignore field is undefined', async () => {
    const first = await api.TestUser.selectFirst({
      where: {
        name: undefined,
        id: userArr[0].id,
      },
      select: { id: true, name: true },
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

  it('insertConflict is working', async () => {
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
  it('updateById', async () => {
    const user = await api.TestUser.selectById(userArr[0].id);
    user!.email = 'checkok@gmail.com';
    await api.TestUser.updateById(user!.id, user!);
    const select = {
      id: true,
      email: true,
    };
    const check = await api.TestUser.selectById(userArr[0].id, select);
    expect(check?.email).toBe('checkok@gmail.com');
  });

  it('upsert should working', async () => {
    for (let index = 0; index < 5; index++) {
      await api.TestPost.upsert({
        where: {
          data: 'upsert',
          userId: userArr[0].id,
        },
        data: {
          data: 'upsert',
          userId: userArr[0].id,
          name: 'check_update@gmail.com',
        },
      });
    }
    const check = await api.TestPost.selectMany({
      where: {
        data: 'upsert',
      },
    });
    expect(check[0].name).toBe('check_update@gmail.com');
    expect(check[0].id).toBeTruthy();
    expect(check.length).toBe(1);
  });

  it('insert or update with empty where', async () => {
    const v = await api.TestPost.upsert({
      data: {
        data: 'upsert ',
        userId: userArr[0].id,
        name: 'update-upsert@gmail.com',
      },
    });
    v.name = 'insertOrUpdate@gmail.com';
    await api.TestPost.upsert({
      data: v,
    });
    const item = await api.TestPost.selectMany({
      where: {
        name: v.name,
      },
    });
    expect(item?.length).toBe(1);
  });

  it('innerJoin will not parse', async () => {
    const data = await api.ky
      .selectFrom('TestPost')
      .limit(1)
      .innerJoin('TestUser', 'TestPost.userId', 'TestUser.id')
      .selectAll()
      // dynamic add any field
      .select(sql.raw('10 as dynamic') as any)
      .execute();
    expect(typeof data[0].data === 'string').toBeTruthy();
    {
      const check = api.parseMany<UserTable>(data, 'TestUser');
      expect(check[0].data.o).toBeTruthy();
    }

    {
      const check = api.parseMany<UserTable & { dynamic: number }>(
        data,
        'TestUser',
        //  then parse it with extend
        z.object({
          dynamic: z.number(),
        })
      );
      expect(check[0].dynamic).toBe(10);
    }
  });
  it('include with select', async () => {
    const data = await api.TestPost.selectFirst({
      select: {
        userId: true,
        name: true,
      },
      include: {
        user: {
          select: {
            email: true,
            id: true,
          },
        },
      },
    });
    expect(data?.user?.id).toBeTruthy();
    expect(data?.user?.email).toBeTruthy();
    expect(data?.user?.data).toBeFalsy();
  });
  it('should work with noid', async () => {
    await api.TestNoId.insertOne({
      postId: '123456',
      userId: '123456',
      sample: 'sample',
    });
    const check = await api.TestNoId.selectMany({});
    expect(check.length).toBe(1);
    expect((check[0] as any)['id']).toBe(undefined);
  });
}
