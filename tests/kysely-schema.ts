import { TypeOf, z } from 'zod';
import { zBoolean, zJsonString } from '../src/helpers/zod';

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
  createdAt: z.union([z.date(), z.string().datetime()]).optional(),
  updatedAt: z.union([z.date(), z.string().datetime()]),
});

export const postSchema = z.object({
  id: z.string(),
  name: z.string(),
  userId: z.string(),
  isPublished: zBoolean,
  data: z.string(),
  createdAt: z.union([z.date(), z.string().datetime()]).optional(),
  updatedAt: z.union([z.date(), z.string().datetime()]).optional(),
});

export const postRelationSchema = postSchema.extend({
  user: zJsonString(userSchema).optional(),
});

export const userRelationSchema = userSchema.extend({
  posts: zJsonString(z.array(postRelationSchema)).optional(),
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
} as const;

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
} as const;
export type PostTable = TypeOf<typeof postRelationSchema>;
export type PostRelation = typeof postTable.relations;

export type UserTable = TypeOf<typeof userRelationSchema>;
export type UserRelation = typeof userTable.relations;

export const dbSchema = z.object({
  TestUser: userRelationSchema,
  TestPost: postRelationSchema,
});

export type Database = TypeOf<typeof dbSchema>;
