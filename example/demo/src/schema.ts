import { z } from 'zod';
import {
	zBoolean,
	zDate,
	zJsonObject,
	zJsonSchema,
	zRelationMany,
	zRelationOne,
} from 'kysely-zod-sqlite';

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
	email: z.string().email(),
	data: zJsonObject<UserData>().optional(),
	config: zJsonSchema(
		z.object({
			language: z.string(),
			status: z.enum(['busy', 'working']),
		})
	).optional(),
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
	posts: zRelationMany({
		schema: postSchema,
		refTarget: 'user_id',
		ref: 'id',
		table: 'test_posts',
	}),
});

export type PostTable = z.output<typeof postRelationSchema>;

export type UserTable = z.output<typeof userRelationSchema>;

export const dbSchema = z.object({
	test_posts: postRelationSchema,
	test_users: userRelationSchema,
});

export type DbSchema = typeof dbSchema;