import { expect, it } from 'vitest';
import { TestApi } from './TestApi';
import { sql } from 'kysely';
import { UserTable } from './kysely-schema';
import { addDays, startOfDay } from 'date-fns';
import { z } from 'zod';
import { zJsonSchema } from '../src';
import Database from 'better-sqlite3';
import fs from 'fs';

export function getDb(): any {
  const db = new Database(':memory:');
  const sqlFile = './migrations/0000_init.sql';
  db.exec(fs.readFileSync(sqlFile, 'utf-8'));
  return db;
}

async function testFixture(api: TestApi, numUser = 1) {
  api.config.logger?.setLevel('silent');
  await api.TestUser.deleteMany({});
  await api.TestPost.deleteMany({});
  const userArr = Array.from({ length: numUser }).map((_, i) => {
    return {
      id: crypto.randomUUID(),
      name: `user${i}`,
      email: `email${i}@gmail.com`,
      data: {
        value: `value${i}`,
        name: `name${i}`,
        o: { a: i },
      },
      createdAt: new Date(),
      updatedAt: startOfDay(addDays(new Date(), i)),
    };
  });
  await api.TestUser.insertMany(userArr);
  const postArr = Array.from({ length: numUser }).map((_, i) => {
    return {
      id: crypto.randomUUID(),
      name: 'post',
      data: '',
      isPublished: i % 2 === 0,
      userId: userArr[i % 2].id,
    };
  });
  await api.TestPost.insertMany(postArr);
  api.config.logger?.setLevel('debug');
  return { userArr, postArr, user: userArr[0] };
}
export function runTest(api: TestApi) {
  it('value type boolean should work', async () => {
    await testFixture(api, 4);
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
    expect(check2.length).toBe(2);
    const check3 = await api.TestPost.selectMany({
      where: {
        isPublished: true,
      },
    });
    expect(check3.length).toBe(2);
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
        createdAt: new Date(),
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
  it('should insert with json', async () => {
    {
      const check = await api.TestUser.insertOne({
        name: 'dafda',
        email: 'withdata@gmail.com',
        data: '' as any,
      });
      const value = await api.TestUser.selectById(check?.id!);
      expect(typeof value?.data).toBe('object');
    }

    {
      const check = await api.TestUser.insertOne({
        name: 'dafda',
        email: 'withconfig@gmail.com',
        data: '' as any,
        config: {
          language: 'dsfdsa',
          status: 'working',
        },
      });

      const value = await api.TestUser.selectById(check?.id!);
      api.TestUser.ky.selectFrom('TestUser').select(['id', 'config']);
      api.TestUser.ky.insertInto('TestUser').values({
        id: '1234',
        name: 'dsfas',
        email: 'wi',
        data: {} as any,
        config: {
          language: 'dsfdsa',
          status: 'working',
        },
      });
      expect(typeof value?.config).toBe('object');
    }
  });

  it('short syntax should working', async () => {
    const { userArr } = await testFixture(api, 10);
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
      expect(check?.id).toBeTruthy();
      expect(check?.id?.length).toBe(36);
      expect(check?.createdAt instanceof Date).toBeTruthy();
      expect(check?.updatedAt instanceof Date).toBeTruthy();
    }
    {
      const postArr = Array.from({ length: 10 }).map((_, i) => {
        return {
          id: crypto.randomUUID(),
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

  it('insert with wrong item should not working', async () => {
    const wrongUser = {
      name: 'check',
      email: 'usercheck@gmail.com',
      wrong: 'false',
      updatedAt: new Date(),
    } as unknown as UserTable;

    await expect(async () => {
      await api.TestUser.insertOne(wrongUser);
    }).rejects.toThrowError();
  });
  it('sort and count working', async () => {
    const { userArr } = await testFixture(api, 10);
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
    {
      const result = await api.TestPost.count({
        where: {
          name: 'post',
          userId: userArr[0].id,
        },
      });
      expect(result).toBe(5);
    }
  });

  it('select with relation one', async () => {
    const { userArr } = await testFixture(api, 1);
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
      expect(check.length).toBe(1);
      expect(check[0].user).toBeTruthy();
    }
  });

  it('select relation array working', async () => {
    const { userArr } = await testFixture(api, 1);
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
    const { userArr } = await testFixture(api, 4);
    {
      const check = await api.batchOneSmt(
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

      expect(check.rows.length).toBe(2);
      expect(check.error).toBeFalsy();

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
      const { error } = await api.batchOneSmt(
        api.ky
          .updateTable('TestUser')
          .set({
            data: sql` json_set(dataxx, '$.value', ?)`,
          })
          .where('name', '=', 'xx'),
        [['aaa', 'user0']]
      );
      expect(error).toBeTruthy();
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
    const { userArr } = await testFixture(api, 4);
    {
      const result = await api.batchAllSmt([
        api.ky.selectFrom('TestUser').selectAll(),
        api.ky.insertInto('TestPost').values({
          id: crypto.randomUUID(),
          name: 'post',
          data: '',
          isPublished: true,
          userId: userArr[0].id,
        }),
      ]);

      const users = result.getMany<UserTable>(0);
      expect(users.length).toBe(4);
      // const post = result.getOne<any>(1);
      // expect(post.changes).toBe(1);
    }
  });
  it('bulks should working', async () => {
    const { userArr } = await testFixture(api, 4);
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
      expect(topUser.length).toBe(4);
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
    await testFixture(api, 10);
    const check = await api.ky
      .selectFrom('TestUser')
      .selectAll()
      .where('updatedAt', '>=', addDays(new Date(), 3))
      .execute();
    expect(check.length).toBe(6);
  });

  it('select where will name field is undefined will thow error', async () => {
    const { userArr } = await testFixture(api, 1);
    await expect(async () => {
      await api.TestUser.selectFirst({
        where: {
          name: undefined,
          id: userArr[0].id,
        },
        select: { id: true, name: true },
      });
    }).rejects.toThrowError();
  });

  it('updateOne should working', async () => {
    await testFixture(api, 5);
    const all = await api.TestUser.selectMany({
      where: {
        name: {
          like: 'user%',
        },
      },
    });
    expect(all.length).toBe(5);
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
    const iuser = await api.TestUser.insertOne({
      email: 'test111@gmail.com',
      name: 'dfdas',
    });
    const user = await api.TestUser.selectById(iuser!.id);
    user!.email = 'checkok@gmail.com';
    await api.TestUser.updateById(user!.id, user!);
  });

  it('upsert should working', async () => {
    const iuser = await api.TestUser.insertOne({
      email: 'testupsert@gmail.com',
      name: 'dfdas',
    });
    for (let index = 0; index < 5; index++) {
      await api.TestPost.upsert({
        where: {
          data: 'upsert',
          userId: iuser?.id,
        },
        data: {
          data: 'upsert',
          userId: iuser?.id,
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
    const { user } = await testFixture(api);
    const v = await api.TestPost.upsert({
      data: {
        data: 'upsert ',
        userId: user?.id,
        name: 'update-upsert@gmail.com',
      },
    });
    expect(v).toBeTruthy();
    if (!v) return;
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
    await testFixture(api, 2);
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
      expect(check[0].data?.o).toBeTruthy();
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
    });
    const test = await api.TestNoId.insertOne({
      postId: '123456',
      userId: '1234567',
      sample: 'sample',
    });
    expect((test as any)?.id).toBeFalsy();
    const check = await api.TestNoId.selectMany({});
    expect(check.length).toBe(2);
    expect((check[0] as any)['id']).toBe(undefined);
    {
      const check = await api.TestNoId.count({
        where: {
          userId: '123456',
        },
      });
      expect(check).toBe(1);
    }
  });

  it('should insert increment', async () => {
    await api.TestOrder.insertOne({
      name: 'test',
      price: 1000,
    });
    const check = await api.TestOrder.insertOne({
      name: 'test',
      price: 1000,
    });
    expect(check?.id).toBeGreaterThanOrEqual(2);
  });
  it('insertMany increment', async () => {
    await api.TestOrder.deleteMany({});
    {
      const check = await api.TestOrder.insertMany([
        { name: 'test', price: 1000 },
        { name: 'test', price: 2000 },
      ]);
      expect(check).toBeTruthy();
      expect(check?.[0].id).toBeTruthy();
      expect(check?.[1].id).toBe(check![0].id + 1);
    }
    {
      const check = await api.TestOrder.insertMany([
        { name: 'test', price: 1000 },
        { name: 'test', price: 2000 },
      ]);
      expect(check?.[0].id).toBeGreaterThanOrEqual(3);
      expect(check?.[1].id).toBe(check![0].id + 1);
    }
  });
  it('should have ability to extend', async () => {
    const extendApi = api.withTables(
      {
        TestExtend: z.object({
          id: z.number(),
          name: z.string(),
          data: zJsonSchema(
            z.object({
              status: z.enum(['ok', 'wrong']),
            })
          ).optional(),
        }),
      },
      {
        testExtend: o => o.table('TestExtend'),
        testUser: o => o.table('TestUser'),
      }
    );
    {
      const check = await extendApi.table('TestExtend').insertOne({
        name: 'testextend',
      });
      expect(check?.id).toBeTruthy();
    }
    {
      const check = await extendApi.testExtend.selectFirst({
        where: { name: 'testextend' },
      });
      expect(check?.id).toBeTruthy();
    }
    {
      const check = await extendApi.ky
        .selectFrom('TestOrder')
        .select('name')
        .executeTakeFirst();
      expect(check?.name).toBeTruthy();
    }
  });
  it('should validate jsonschema', async () => {
    await api.TestUser.insertOne({
      name: 'dsfdsa',
      email: 'jsonschema@gmail.com',
    });
    await expect(async () => {
      await api.TestUser.insertOne({
        config: { ldsafsa: 'dasd' } as any,
        name: 'dsfdsa',
        email: 'jsonschema@gmail.com',
      });
    }).rejects.toThrowError();
  });

}
