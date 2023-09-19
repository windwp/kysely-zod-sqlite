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

export type PostTable = z.output<typeof postRelationSchema>;

export type UserTable = z.output<typeof userRelationSchema>;

export const dbSchema = z.object({
	TestPost: postRelationSchema,
	TestUser: userRelationSchema,
});

export type DbSchema = typeof dbSchema;
