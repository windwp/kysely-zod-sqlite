import { TypeOf, z } from 'zod';
import { zBoolean, zDate, zJsonObject, zJsonSchema } from '../src/helpers/zod';
import { TableDefinition } from '../src/types';

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
  data: zJsonObject<UserData>(),
  createdAt: zDate,
  updatedAt: zDate,
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

export const postRelationSchema = postSchema.extend({
  user: zJsonSchema(userSchema).optional(),
});

export const userRelationSchema = userSchema.extend({
  posts: zJsonSchema(z.array(postRelationSchema)).optional(),
});

export const userTable = {
  tableName: 'TestUser',
  idPrefix: 'u',
  timeStamp: true,
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
  idPrefix: 'po',
  timeStamp: true,
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

export type UserTable = TypeOf<typeof userRelationSchema>;

export const dbSchema = z.object({
  TestUser: userRelationSchema,
  TestPost: postRelationSchema,
});

export type Database = TypeOf<typeof dbSchema>;
