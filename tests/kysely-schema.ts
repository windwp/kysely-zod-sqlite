import { z } from 'zod';
import {
  zBoolean,
  zDate,
  zJsonObject,
  zJsonSchema,
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
  email: z.string(),
  data: zJsonObject<UserData>().optional(),
  config: zJsonSchema(
    z
      .object({
        language: z.string(),
        status: z.enum(['busy', 'working']),
      })
      .optional()
  ),
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
  test: zJsonObject<any>(),
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
  sample: z.string().default('visual'),
});
export type NoIdTable = z.input<typeof testNoIdSchema>;

export type PostTable = z.input<typeof postRelationSchema>;

export type UserTable = z.input<typeof userRelationSchema>;

export const orderSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.number(),
});

export type OrderTable = z.input<typeof orderSchema>;
export const dbSchema = z.object({
  TestPost: postRelationSchema,
  TestUser: userRelationSchema,
  TestNoId: testNoIdSchema,
  TestOrder: orderSchema,
});

export type Schema = typeof dbSchema;
