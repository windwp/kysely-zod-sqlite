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
  point: z.number().optional(),
  config: zJsonSchema(
    z
      .object({
        language: z.string(),
        status: z.enum(['busy', 'working']),
      })
      .optional()
  ),
  created_at: zDate(),
  updated_at: zDate(),
});

export const postSchema = z.object({
  id: z.string(),
  name: z.string(),
  user_id: z.string(),
  is_published: zBoolean(),
  data: z.string(),
  created_at: zDate(),
  updated_at: zDate(),
});

export const postRelationSchema = postSchema.extend({
  user: zRelationOne({
    schema: userSchema,
    ref: 'user_id',
    refTarget: 'id',
    table: 'test_users',
  }),
});

export const userRelationSchema = userSchema.extend({
  test: zJsonObject<any>(),
  posts: zRelationMany({
    schema: postSchema,
    refTarget: 'user_id',
    ref: 'id',
    table: 'test_posts',
  }),
});
export const testNoIdSchema = z.object({
  user_id: z.string(),
  post_id: z.string(),
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
  test_posts: postRelationSchema,
  test_users: userRelationSchema,
  test_noids: testNoIdSchema,
  test_orders: orderSchema,
});

export type Schema = typeof dbSchema;
