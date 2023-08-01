import { TypeOf, z } from 'zod';
import {
  zBoolean,
  zDate,
  zJsonArray,
  zJsonObject,
  zJsonSchema,
} from '../src/helpers/zod';

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
  user: zJsonObject<TypeOf<typeof userSchema>>().optional(),
});

export const userRelationSchema = userSchema.extend({
  posts: zJsonArray<TypeOf<typeof postSchema>>().optional(),
});

export const userTable = {
  table: 'TestUser',
  timeStamp: true,
  relations: {
    posts: {
      schema: postSchema,
      refTarget: 'userId',
      ref: 'id',
      table: 'TestPost',
      type: 'many',
    },
  },
} as const;

export const postTable = {
  table: 'TestPost',
  timeStamp: true,
  relations: {
    user: {
      schema: userSchema,
      ref: 'userId',
      refTarget: 'id',
      table: 'TestUser',
      type: 'one',
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
