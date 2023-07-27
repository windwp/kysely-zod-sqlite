import { TypeOf, z } from 'zod';
import { TableDefinition } from '../src/types';

const zBoolean = z.custom<boolean>().transform(value => {
  if (typeof value === 'boolean') return value;
  return value === 'true';
});

function zJsonString<T>(schema: z.Schema<T>) {
  return z
    .custom<T>()
    .transform((v, ctx): T => {
      if (!v) return v;
      if (typeof v === 'string') {
        try {
          return schema.parse(JSON.parse(v));
        } catch (e: any) {
          ctx.addIssue({
            code: 'custom',
            message: e.message,
          });
          return z.NEVER;
        }
      }
      return v;
    })
    .optional();
}

const dataSchema = z.object({
  value: z.string(),
  name: z.string(),
  o: z.object({
    a: z.number(),
  }),
});
type UserData = z.infer<typeof dataSchema>;

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  data: zJsonString<UserData>(dataSchema),
  updateAt: z.union([z.date(), z.string().datetime()]).optional(),
});

export const postSchema = z.object({
  id: z.string(),
  name: z.string(),
  userId: z.string(),
  isPublished: zBoolean,
  data: z.string(),
});

export const postRelationSchema = postSchema.extend({
  user: zJsonString(userSchema.optional()),
});

export const userRelationSchema = userSchema.extend({
  posts: zJsonString(z.array(postRelationSchema)),
});

export const userTable = {
  tableName: 'TestUser',
  relations: {
    posts: {
      refTarget: 'userId',
      ref: 'id',
      table: 'TestPost',
      alias: 'posts',
      type: 'OneToMany',
      select: Object.keys(postSchema.shape),
    },
  },
} satisfies TableDefinition;

export const postTable = {
  tableName: 'TestPost',
  relations: {
    user: {
      ref: 'userId',
      refTarget: 'id',
      table: 'TestUser',
      alias: 'user',
      type: 'OneToOne',
      select: Object.keys(userSchema.shape),
    },
  },
} satisfies TableDefinition;

export type PostTable = TypeOf<typeof postRelationSchema>;
export type PostRelation = typeof postTable.relations;

export type UserTable = TypeOf<typeof userRelationSchema>;
export type UserRelation = typeof userTable.relations;

export const dbSchema = z.object({
  TestUser: userRelationSchema,
  TestPost: postRelationSchema,
});

export type Database = TypeOf<typeof dbSchema>;
