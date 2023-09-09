import { TypeOf, z } from 'zod';
import {
  zBoolean,
  zDate,
  zJsonObject,
  zRelationMany,
  zRelationOne,
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
  createdAt: zDate(),
  updatedAt: zDate(),
});

export const postSchema = z.object({
  id: z.string(),
  name: z.string(),
  userId: z.string(),
  isPublished: zBoolean(),
  data: z.string(),
  createdAt: zDate(),
  updatedAt: zDate(),
});

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
export const testNoIdSchema = z.object({
  userId: z.string(),
  postId: z.string(),
  sample: z.string(),
});
export type NoIdTable = TypeOf<typeof testNoIdSchema>;

export type PostTable = TypeOf<typeof postRelationSchema>;

export type UserTable = TypeOf<typeof userRelationSchema>;

export const orderSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.number(),
});

export type OrderTable = TypeOf<typeof orderSchema>;
export const dbSchema = z.object({
  TestUser: userRelationSchema,
  TestPost: postRelationSchema,
  TestNoId: testNoIdSchema,
  TestOrder: orderSchema,
});

export type Database = TypeOf<typeof dbSchema>;
