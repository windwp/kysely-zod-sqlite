import { expect, it } from 'vitest';
import { TestApi, test_postsgresApi } from './TestApi';
import { sql } from 'kysely';
import { UserTable } from './kysely-schema';
import { addDays, startOfDay } from 'date-fns';
import { z } from 'zod';
import Database from 'better-sqlite3';
import fs from 'fs';
import { zDate } from '../src';

export function getDb(): any {
  const db = new Database(':memory:');
  const sqlFile = './sql/sqlite.sql';
  db.exec(fs.readFileSync(sqlFile, 'utf-8'));
  return db;
}

async function testFixture(api: TestApi | test_postsgresApi, numUser = 1) {
  api.config.logger?.setLevel('silent');
  await api.test_users.deleteMany({});
  await api.test_posts.deleteMany({});
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
      created_at: new Date(),
      updated_at: startOfDay(addDays(new Date(), i)),
    };
  });
  await api.test_users.insertMany(userArr);
  const postArr = Array.from({ length: numUser }).map((_, i) => {
    return {
      id: crypto.randomUUID(),
      name: 'post',
      data: '',
      is_published: i % 2 === 0,
      user_id: userArr[i % 2].id,
    };
  });
  await api.test_posts.insertMany(postArr);
  api.config.logger?.setLevel('debug');
  return { userArr, postArr, user: userArr[0] };
}
export function runTest(api: TestApi | test_postsgresApi, dialect = 'sqlite') {
  it('value type boolean should work', async () => {
    await testFixture(api, 4);
    const check = await api.test_posts.selectMany({
      take: 2,
    });
    expect(check[0].is_published).toBe(true);
    expect(check[1].is_published).toBe(false);
    const check2 = await api.test_posts.selectMany({
      where: {
        is_published: false,
      },
    });
    expect(check2.length).toBe(2);
    const check3 = await api.test_posts.selectMany({
      where: {
        is_published: true,
      },
    });
    expect(check3.length).toBe(2);
  });

  it('should be able to do a crud on kysely', async () => {
    const testId = '123456';
    await api.ky
      .insertInto('test_users')
      .values({
        id: testId,
        name: 'test',
        email: 'test@gmail.com',
        point: 0,
        data: {
          value: 'value1',
          name: 'name1',
          o: {
            a: 10,
          },
        },
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();
    const first = await api.ky
      .selectFrom('test_users')
      .where('id', '=', testId)
      .selectAll()
      .executeTakeFirst();

    expect(first?.data?.o.a).toBe(10);
    const check = await api.ky
      .updateTable('test_users')
      .set({ name: 'test' })
      .where('id', '=', testId)
      .executeTakeFirst();
    expect(Number(check.numUpdatedRows)).toBe(1);
  });
  it('should insert with json', async () => {
    {
      const check = await api.test_users.insertOne({
        name: 'dafda',
        email: 'withdata@gmail.com',
        data: '' as any,
      });
      const value = await api.test_users.selectById(check?.id!);
      expect(typeof value?.data).toBe('object');
    }

    {
      const check = await api.test_users.insertOne({
        name: 'dafda',
        email: 'withconfig@gmail.com',
        data: '' as any,
        config: {
          language: 'dsfdsa',
          status: 'working',
        },
      });

      const value = await api.test_users.selectById(check?.id!);
      api.test_users.ky.selectFrom('test_users').select(['id', 'config']);
      api.test_users.ky.insertInto('test_users').values({
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
      const check = await api.test_users.selectMany({
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
      const check = await api.test_users.selectById(userArr[0].id);
      expect(check?.id).toBe(userArr[0].id);
      expect(check?.created_at instanceof Date).toBeTruthy();
      expect(check?.updated_at instanceof Date).toBeTruthy();
    }
    {
      const check = await api.test_users.insertOne({
        name: 'check',
        email: 'usercheck@gmail.com',
        updated_at: new Date(),
      });
      expect(check?.id).toBeTruthy();
      expect(check?.id?.length).toBe(36);
      expect(check?.created_at instanceof Date).toBeTruthy();
      expect(check?.updated_at instanceof Date).toBeTruthy();
    }
    {
      const check = await api.test_users.insertOne({
        id: 'custom-id',
        name: 'check2',
        email: 'usercheck2@gmail.com',
        updated_at: new Date(),
      });
      expect(check?.id).toBeTruthy();
      expect(check?.id).toBe('custom-id');
    }
    {
      const postArr = Array.from({ length: 10 }).map((_, i) => {
        return {
          id: crypto.randomUUID(),
          name: 'crudPost',
          data: '',
          user_id: userArr[i % 2].id,
        };
      });
      await api.test_posts.insertMany(postArr);
      await api.test_posts.deleteMany({
        where: {
          name: 'crudPost',
          user_id: userArr[0].id,
        },
      });
      const check = await api.test_posts.selectMany({
        where: {
          name: 'crudPost',
        },
      });
      expect(check.length).toBe(5);
      const data = await api.test_posts.updateMany({
        where: {
          name: 'crudPost',
        },
        data: {
          name: 'crudPost2',
          user_id: userArr[0].id,
        },
      });
      expect(Number(data.numUpdatedRows)).toBe(5);
    }
  });

  it('insert with wrong item should not working', async () => {
    const wrongUser = {
      name: 'check',
      email: 'usercheck@gmail.com',
      wrong: 'false',
      updated_at: new Date(),
    } as unknown as UserTable;

    await expect(async () => {
      await api.test_users.insertOne(wrongUser);
    }).rejects.toThrowError();
  });
  it('sort and count working', async () => {
    const { userArr } = await testFixture(api, 10);
    const check = await api.test_users.selectMany({
      where: {
        name: {
          like: 'user%',
        },
      },
      select: { id: true, name: true },
      skip: 2,
      take: 4,
      orderBy: {
        updated_at: 'desc',
      },
    });
    expect(check[0].id).toBe(userArr[7].id);
    {
      const result = await api.test_posts.count({
        where: {
          name: 'post',
          user_id: userArr[0].id,
        },
      });
      expect(result).toBe(5);
    }
  });

  it('select with relation one', async () => {
    const { userArr } = await testFixture(api, 1);
    {
      const topPost = await api.test_posts.selectMany({
        take: 1,
      });
      expect(topPost[0]).toBeTruthy();

      const check = await api.test_posts.selectFirst({
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
      const check = await api.test_posts.selectMany({
        where: {
          name: {
            like: 'post%',
          },
          user_id: userArr[0].id,
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
    const result = await api.test_users.selectFirst({
      where: {
        id: userArr[0].id,
      },
      include: {
        posts: true,
      },
    });
    expect(result?.posts?.[0].user_id).toBe(userArr[0].id);
  });

  it('batchone should working', async () => {
    const { userArr } = await testFixture(api, 4);
    {
      const check = await api.batchOneSmt(
        api.ky
          .updateTable('test_users')
          .set({
            point: sql`point + 1000`,
          })
          .where('name', '=', api.param(1)),
        [['user0'], ['user1']]
      );

      expect(check.rows.length).toBe(2);
      expect(check.error).toBeFalsy();

      const check0 = await api.test_users.selectFirst({
        where: {
          name: 'user0',
        },
      });
      expect(check0?.point).toBe(1000);
    }
    {
      await api.batchOneSmt(
        sql`update "test_users" set name = ${api.param(1)} where id = ${api.param(
          2
        )}`,
        [['user2', userArr[0].id]]
      );
    }
    {
      const { error } = await api.batchOneSmt(
        api.ky
          .updateTable('test_users')
          .set({
            data: sql`json_set(dataxx, '$.value', ?)`,
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
      api.ky.updateTable('test_users').set(newUsers[0]).where('name', '=', '?'),
      newUsers.map(o => {
        return [...Object.values(o), o.name];
      })
    );
  });
  it('batchAll should work ', async () => {
    const { userArr } = await testFixture(api, 4);
    {
      const result = await api.batchAllSmt([
        api.ky.selectFrom('test_users').selectAll(),
        api.ky.insertInto('test_posts').values({
          id: crypto.randomUUID(),
          name: 'post',
          data: '',
          is_published: true,
          user_id: userArr[0].id,
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
        user:
          dialect === 'sqlite'
            ? api.$batchOneSmt(
                api.ky
                  .updateTable('test_users')
                  .where('name', '=', '?')
                  .set({
                    data: sql` json_set(data, '$.value', ?)`,
                  }),
                [
                  ['aaa', 'user0'],
                  ['bbb', 'user1'],
                ]
              )
            : api.$batchOneSmt(
                api.ky
                  .updateTable('test_users')
                  .where('name', '=', '$1')
                  .set({
                    data: sql`jsonb_set(data, '{value}', $2)`,
                  }),
                [
                  ['user0', '"aaa"'],
                  ['user1', '"bbb"'],
                ]
              ),
        topUser: api.test_users.$selectMany({
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
      const user0 = await api.test_users.selectFirst({
        where: { name: 'user0' },
      });
      expect(user0?.data?.value).toBe('aaa');
    }
  });

  it('should compare date', async () => {
    await testFixture(api, 10);
    const check = await api.ky
      .selectFrom('test_users')
      .selectAll()
      .where('updated_at', '>=', addDays(new Date(), 3))
      .execute();
    expect(check.length).toBe(6);
  });

  it('select where will name field is undefined will thow error', async () => {
    const { userArr } = await testFixture(api, 1);
    await expect(async () => {
      await api.test_users.selectFirst({
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
    const all = await api.test_users.selectMany({
      where: {
        name: {
          like: 'user%',
        },
      },
    });
    expect(all.length).toBe(5);
    await api.test_users.updateOne({
      where: {
        name: {
          like: 'user%',
        },
      },
      data: {
        name: 'check',
      },
    });
    const check = await api.test_users.selectMany({
      where: { name: 'check' },
    });
    expect(check.length).toBe(1);
  });

  it('insertConflict is working', async () => {
    const check = await api.test_users.insertConflict({
      create: {
        name: 'check',
        email: 'test@gmail.com',
        point: 0,
      },
      update: {
        name: 'test',
      },
      conflicts: ['email'],
    });
    await api.test_users.insertConflict({
      create: {
        name: 'check',
        email: 'test@gmail.com',
      },
      update: {
        name: 'test2',
      },
      conflicts: ['email'],
    });
    const check2 = await api.test_users.selectMany({
      where: {
        email: 'test@gmail.com',
      },
    });
    expect(check2.length).toBe(1);
    expect(check2[0].id).toBe(check.id);
  });
  it('updateById', async () => {
    const iuser = await api.test_users.insertOne({
      email: 'test111@gmail.com',
      name: 'dfdas',
    });
    const user = await api.test_users.selectById(iuser!.id);
    user!.email = 'checkok@gmail.com';
    await api.test_users.updateById(user!.id, user!);
  });

  it('upsert should working', async () => {
    const iuser = await api.test_users.insertOne({
      email: 'testupsert@gmail.com',
      name: 'dfdas',
    });
    for (let index = 0; index < 5; index++) {
      await api.test_posts.upsert({
        where: {
          data: '12345',
          user_id: iuser?.id,
        },
        data: {
          data: '12345',
          user_id: iuser?.id,
          name: 'check_update@gmail.com',
        },
      });
    }
    const check = await api.test_posts.selectMany({
      where: {
        data: '12345',
      },
    });
    expect(check[0].name).toBe('check_update@gmail.com');
    expect(check[0].id).toBeTruthy();
    expect(check.length).toBe(1);
  });

  it('insert or update with empty where', async () => {
    const { user } = await testFixture(api);
    const v = await api.test_posts.upsert({
      data: {
        data: 'upsert ',
        user_id: user?.id,
        name: 'update-upsert@gmail.com',
      },
    });
    expect(v).toBeTruthy();
    if (!v) return;
    v.name = 'insertOrUpdate@gmail.com';
    await api.test_posts.upsert({
      data: v,
    });
    const item = await api.test_posts.selectMany({
      where: {
        name: v.name,
      },
    });
    expect(item?.length).toBe(1);
  });

  it('innerJoin will not parse', async () => {
    await testFixture(api, 2);
    const data = await api.ky
      .selectFrom('test_posts')
      .limit(1)
      .innerJoin('test_users', 'test_posts.user_id', 'test_users.id')
      .selectAll()
      .select(sql`10`.as('dynamic'))
      .execute();

    if (dialect === 'sqlite') {
      expect(typeof data[0].data === 'string').toBeTruthy();
    }
    {
      const check = api.parseMany<UserTable>(data, 'test_users');
      expect(check[0].data?.o).toBeTruthy();
    }

    {
      const check = api.parseMany<UserTable & { dynamic: number }>(
        data,
        'test_users',
        //  then parse it with extend
        z.object({
          dynamic: z.number(),
        })
      );
      expect(check[0].dynamic).toBe(10);
    }
  });
  it('include with select', async () => {
    await testFixture(api, 1);
    const data = await api.test_posts.selectFirst({
      select: {
        user_id: true,
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
    await api.test_noids.insertOne({
      post_id: '123456',
      user_id: '123456',
    });
    const test = await api.test_noids.insertOne({
      post_id: '123456',
      user_id: '1234567',
      sample: 'sample',
    });
    expect((test as any)?.id).toBeFalsy();
    const check = await api.test_noids.selectMany({});
    expect(check.length).toBe(2);
    expect((check[0] as any)['id']).toBe(undefined);
    const count = await api.test_noids.count({ where: { user_id: '123456' } });
    expect(count).toBe(1);
  });

  it('should insert increment', async () => {
    await api.test_orders.insertOne({
      name: 'test',
      price: 1000,
    });
    const check = await api.test_orders.insertOne({
      name: 'test',
      price: 1000,
    });
    expect(check?.id).toBeGreaterThanOrEqual(2);
  });
  it('insertMany increment', async () => {
    await api.test_orders.deleteMany({});
    {
      const check = await api.test_orders.insertMany([
        { name: 'test', price: 1000 },
        { name: 'test', price: 2000 },
      ]);
      expect(check).toBeTruthy();
      expect(check?.[0].id).toBeTruthy();
      expect(check?.[1].id).toBe(check![0].id + 1);
    }
    {
      const check = await api.test_orders.insertMany([
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
          created_at: zDate(),
        }),
      },
      {
        testExtend: o => o.table('TestExtend'),
        test_users: o => o.table('test_users'),
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
      expect(check?.created_at instanceof Date).toBeTruthy();
    }
    // it can select the order table
    await extendApi.ky.selectFrom('test_orders').select('name').execute();
  });
  it('should validate jsonschema', async () => {
    await api.test_users.insertOne({
      name: 'dsfdsa',
      email: 'jsonschema@gmail.com',
    });
    await expect(async () => {
      await api.test_users.insertOne({
        config: { dsafsa: 'dasd' } as any,
        name: 'dsfdsa',
        email: 'jsonschema@gmail.com',
      });
    }).rejects.toThrowError();
  });

  it('should update by sql syntax with updateOne', async () => {
    const user = await api.test_users.insertOne({
      name: 'user01',
      email: 'user011@gmail.com',
      point: 1000,
    });
    const p = 10;
    await api.test_users.updateOne({
      where: {
        id: user?.id,
      },
      data: { point: sql`point + ${p}` },
    });
    const check = await api.test_users.selectFirst({
      where: { email: 'user011@gmail.com' },
    });
    expect(check?.point).toBe(1010);
  });
}
