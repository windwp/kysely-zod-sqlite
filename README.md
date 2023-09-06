# Feature 
An flexible api for Cloudflare D1 and sqlite.
It has an simple api of Prisma and a powerful query with Kysely.

- [x] parse model by zod (for json string, boolean and datetime) 
- [x] remote proxy call from your app to worker or between worker by binding service
- [x] api like primsa (support 1 level relation)
- [x] unit testing D1 on local.

# Usage
### Define zod schema
Define zod and use it for kysely model. Schema can be reuse on trpc router

``` typescript 
import {
  zBoolean,
  zDate,
  zJsonArray,
  zJsonObject,
  zJsonSchema,
  zRelationOne,
} from 'kysely-zod-sqlite';
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  data: zJsonObject<UserData>(),  // It use Json.parse
  config: zJsonSchema(z.object({
    language:z.string(),
    status: z.enum(['busy', 'working' ]),
  })), // zod schema to parse
  createdAt: zDate, // parse sqlite date
  updatedAt: zDate,
  isDelete: zBoolean, // parse boolean 1,0
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
export type PostTable = TypeOf<typeof postRelationSchema>;
export type UserTable = TypeOf<typeof userRelationSchema>;
// define an api Database
export const dbSchema = z.object({
  TestUser: userRelationSchema,
  TestPost: postRelationSchema,
});
export type Database = TypeOf<typeof dbSchema>;
```
then you use that schema to define api
```typescript
export class TestApi extends SqliteApi<Database> {
  
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
  driver: new D1Driver(env.D1_DB,config)
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
you can change the driver for different enviroment by inject a different driver on setup
### Local enviroment and unit test
```typescript
const api = new TestApi({
  config,
  schema: dbSchema,
  driver: new BetterDriver(new Database(':memory:'), config),
});
```
### working inside worker and pages
```typescript
const api = new TestApi({
  config,
  schema: dbSchema,
  driver: new D1Driver(env.D1_DB, config),
});
```
### working outside cloudflare worker, pages
You need to deploy a custom worker then you can connect to it on your app
[worker remote](./example/worker/src/worker.ts)
```typescript
const api = new TestApi({
  config,
  schema: dbSchema,
  driver: new FetchDriver(env.D1_DB, {
    apiUrl: 'https://{worker}.pages.dev', // your worker url
    apiKey: 'test',
    database: 'Test',
    logger: logger,
  }),
});
```
### call from cloudflare pages to worker or from worker to worker
```typescript
const api = new TestApi({
  config,
  schema: dbSchema,
  driver: new FetchDriver(env.D1_DB, {
    apiKey: 'test',
    apiUrl: 'https://{worker}.pages.dev',
    database: 'Test',
    bindingService:env.WORKER_BINDING,
    // it will use env.WORKER_BINDING.fetch not a global fetch
    logger: loglevel,
  }),
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
### bulk method
working with array on batch method is difficult when you run query depend on some condition.
so I create bulk
```typescript
const check = await api.bulk({
  allUser: isAdmin ? api.ky.selectFrom('TestUser').selectAll(): undefined;
  insert: api.ky.insertInto('TestPost').values({
    id: uid(),
    name: 'post',
    data: '',
    isPublished: true,
    userId: userArr[0].id,
  }),
});
// It use key value to retrieve result
const allUser = check.getMany<UserTable>('allUser'); 
const allUser = check.getOne<any>('insert'); 

//prisma query can use on bulk too. You can even run batch inside of bulk 🥰
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
});
```
# FAQ

### Is that libary is a ORM?
No, It just a wrapper around kysely with a parser model from zod.

### Parse custom schema on query with join
By default when you use any join select query. It is not automatic parse by zod
you can use that method to do it.
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
