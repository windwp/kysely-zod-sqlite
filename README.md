# Intro 
An flexible api for Cloudflare D1 and sqlite.

It has an simple api of Prisma and a powerful query with Kysely, runtime transform and validation model with zod.

# Feature
- [x] validation and parse model by zod (json text string on sqlite)
- [x] remote call from your local app to worker or between worker by binding service
- [x] api like primsa (support 1 level relation)
- [x] unit testing D1 on local.

# Install
`npm install kysely-zod-sqlite`

# Usage
### Define zod schema
Define zod and use it for kysely model.

``` typescript 
import {z} from zod
import {
  zJsonObject,
  zJsonSchema,
  zRelationOne,
  zBoolean,
  zDate,
} from 'kysely-zod-sqlite';
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  data: zJsonObject<UserData>(),  // it use JSON.parse
  config: zJsonSchema(z.object({  // it use zod.parse
    language:z.string(),
    status: z.enum(['busy', 'working' ]),
  })), 
  createdAt: zDate(), //custom parse sqlite date
  updatedAt: zDate(),
  isDelete: zBoolean(), // parse boolean 1,0 or you can use z.coerce.boolean()
});
export const postSchema = z.object({
  id: z.string(),
  name: z.string(),
  userId: z.string(),
  isPublished: zBoolean,
  data: z.string(),
  createdAt: zDate,
  updatedAt: zDate,
});
// define a relation
export const postRelationSchema = postSchema.extend({
  user: zRelationOne({
    schema: userSchema,
    ref: 'userId',
    refTarget: 'id',
    table: 'TestUser',
  }),
});
export const userRelationSchema = userSchema.extend({
  posts: zRelationMany({
    schema: postSchema,
    refTarget: 'userId',
    ref: 'id',
    table: 'TestPost',
  }),
});
export type PostTable = z.infer<typeof postRelationSchema>;
export type UserTable = z.infer<typeof userRelationSchema>;
// define an api Database
export const dbSchema = z.object({
  TestUser: userRelationSchema,
  TestPost: postRelationSchema,
});
export type DbSchema = typeof dbSchema;
```
use schema to define api
```typescript
export class TestApi extends SqliteApi<DbSchema> {
  
  get TestUser() {
    return this.table('TestUser');
  } // api like prisma
  get TestPost() {
    return this.table('TestPost');
  }
}
const config = {}; 
const api = new TestApi({
  schema: dbSchema,
  config: {},
  kysely: createKyselySqlite({
    driver: new BetterDriver(new Database(':memory:'), config),
    schema: dbSchema,
  }),
})
```
### Usage
prisma similar api
```typescript
const post = await api.TestPost.selectFirst({
  where: { name: 'test' },
  include: {
    user: true, // query 1 level relation
  },
})
// access relation and json data 🔥
const language = post.user.config.language
await api.TestUser.updateOne({
  where: {
    name: {
      like: 'user%', // it use kysely operation  = ('name' , 'like', 'user%') 
    }, 
  },
  data: { name: 'test' },
});
```
If you want to write a complex query you can use kysely
```typescript
const data = await api.ky // this is a reference of kysely builder
    .selectFrom('TestPost')
    .limit(1)
    .innerJoin('TestUser', 'TestPost.userId', 'TestUser.id')
    .selectAll()
    .execute();
```
## Driver
### Local enviroment and unit test
```typescript
import { BetterSqlite3Driver } from 'kysely-zod-sqlite/driver/sqlite-driver';
const api = new TestApi({
  config,
  schema: dbSchema,
  kysely: createKyselySqlite({
    driver: new BetterDriver(new Database(':memory:'), config),
    schema: dbSchema,
  }),
});
```
### Working inside worker and pages
```typescript
import { D1Driver } from 'kysely-zod-sqlite/driver/d1-driver';
const api = new TestApi({
  config,
  schema: dbSchema,
  kysely: createKyselySqlite({
    driver: new FetchDriver({
      apiKey: process.env.API_KEY!,
      apiUrl: process.env.API_URL!,
    }),
    schema: dbSchema,
  }),
});
```
### Working outside cloudflare worker, pages
You need to deploy a custom worker then you can connect to it on your app

[worker](./example/worker/src/worker.ts)
```typescript
import { FetchDriver } from 'kysely-zod-sqlite/driver/fetch-driver';
const api = new TestApi({
  config,
  schema: dbSchema, 
  kysely: createKyselySqlite({
    driver: new FetchDriver({
      apiKey: process.env.API_KEY!,
      apiUrl: process.env.API_URL!,
    }),
    schema: dbSchema,
  }),
});
```
### Call from cloudflare pages to worker or from worker to worker
```typescript
import { FetchDriver } from 'kysely-zod-sqlite/driver/fetch-driver';
const api = new TestApi({
  config,
  schema: dbSchema,
  kysely: createKyselySqlite({
    driver: new FetchDriver(env.D1_DB, {
      apiKey: 'test',
      apiUrl: 'https://{worker}.pages.dev',
      database: 'Test',
      bindingService: env.WORKER_BINDING,
      // it will use env.WORKER_BINDING.fetch not a global fetch
    }),
    schema: dbSchema,
  }),
});
```
### Multiple driver per table
```typescript
export class TestApi extends SqliteApi<Database> {
  //... another table use a default driver

  get TestLog(){
    return this.table('TestLog',{ driver: new FetchDriver(...)});
  }
}
// dynamic add schema and driver 
const api = new TestApi(...)

const extendApi = api.withTables(
  {
    TestExtend: z.object({
      id: z.number().optional(),
      name: z.string(),
    }),
  },
  { testExtend: o => o.table('TestExtend',{driver: new D1Driver(...)}),}
);

const check = await extendApi.testExtend.selectFirst({
  where: { name: 'testextend' },
});

```

### Support batch
```typescript
// raw sql query 
await api.batchOneSmt(
  sql`update TestUser set name = ? where id = ?`, 
  [ ['aaa', 'id1'], ['bbb', 'id2'], ]
);
// run kysely query with multiple value
const check = await api.batchOneSmt(
    api.ky
      .updateTable('TestUser')
      .set({
        data: sql` json_set(data, '$.value', ?)`,
      })
      .where('name', '=', '?'),
    [ ['aaa', 'user0'], ['bbb', 'user1'], ]
);
// run multiple query on batch
const result = await api.batchAllSmt([
  api.ky.selectFrom('TestUser').selectAll(), // kysely query
  api.ky.insertInto('TestPost').values({
    id: uid(),
    name: 'post',
    data: '',
    isPublished: true,
    userId: userArr[0].id,
  }),
  api.TestUser.$selectMany({  // prisma syntax (add $ before select)
      take: 10,
      include: {
        posts: true,
      },
      select: {
        id: true,
      },
  })
]);
const users = result.getMany<UserTable>(0);
const post = result.getOne<PostTable>(1);
```
### Bulk method
working with array on batch method is difficult.
when you run query depend on some condition so I create bulk.
recommend use bulk for FetchDriver if you have multiple request
```typescript
const check = await api.bulk({
  // skip that query for normal user
  allUser: isAdmin ? api.ky.selectFrom('TestUser').selectAll(): undefined; 
  insert: api.ky.insertInto('TestPost').values({
    id: uid(),
    name: 'post',
    data: '',
    isPublished: true,
    userId: userArr[0].id,
  }),
});
// It use **key - value** to.
const allUser = check.getMany<UserTable>('allUser'); 
const allUser = check.getOne<any>('insert'); 

//prisma query can use on bulk too. You can even run batch inside of bulk 🥰
const check = await api.bulk({
  user:
    api.ky
      .updateTable('TestUser')
      .set({
        data: sql` json_set(data, '$.value', ?)`,
      })
      .where('name', '=', '?'),
  ,
  topUser: api.TestUser.$selectMany({
    take: 10,
    include: {
      posts: true,
    },
    select: {
      id: true,
    },
  }),
});
```
# FAQ

### Is that library is a ORM?
No, It just a wrapper around kysely. 
You can think it is an API with zod for validation and kysely for query

### Different between using table vs kysely
``` typescript
api.table('aaa').insertOne({...}) // validation runtime value with zod
api.ky.insertInto('aaa').values({...}) // it is type checking
```

### What is $ on table
```typescript
api.table('aaa').selectMany() // use it to get data
api.table('aaa').$selectMany() 
// it is kysely query you can modify that query or use it on batch
```

### column is null
when your database column can null. you need to use nullable not optional on your model
```typescript
access_token: z.string().optional().nullable(),
```

### Parse custom schema on query with join
```typescript
api.parseMany<UserTable & { dynamic: number }>(
  data,
 'TestUser', 
  // a joinSchema
  z.object({  
    dynamic: z.number(),
  })
```
### migration 
use the migration from kysely


# Thank
[kysely](https://github.com/kysely-org/kysely)
[zod](https://github.com/colinhacks/zod)
[@subframe7536](https://github.com/subframe7536/kysely-sqlite-tools/tree/master/packages/plugin-serialize)
[@ryansonshine](https://github.com/ryansonshine/typescript-npm-package-template)
# Links
[cloudflare](https://developers.cloudflare.com/d1/platform/client-api/)
[better-sqlite3](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
