import { SqliteApi, createKyselySqlite } from 'kysely-zod-sqlite';
import { D1Driver } from 'kysely-zod-sqlite/driver/d1-driver';
import { dbSchema, DbSchema } from './schema';
import logger from 'loglevel';
export class TestApi extends SqliteApi<DbSchema> {
	get test_users() {
		return this.table('test_users');
	}
	get test_posts() {
		return this.table('test_posts');
	}
}
export interface Env {
	D1_DB: D1Database;
	DB_API_KEY: string;
}

export default {
	async fetch(_: Request, env: Env) {
		const config = { logger };
		const api = new TestApi({
			schema: dbSchema,
			config: config,
			kysely: createKyselySqlite({
				driver: new D1Driver(env.D1_DB, config),
				schema: dbSchema,
			}),
		});
		await api.test_users.deleteMany({});
		const user = await api.test_users.insertOne({
			name: 'test-test',
			email: 'test@gmail.com',
			config: {
				language: 'test',
				status: 'busy',
			},
			data: {
				value: 'sfsa',
				name: 'fdasfdsa',
				o: {
					a: 1234,
				},
			},
		});
		if (user) {
			await api.test_posts.insertOne({
				name: 'fdsadfsa',
				user_id: user?.id,
				data: 'fdafdas',
				is_published: false,
			});
			await api.test_posts.insertOne({
				name: 'fdsadfsa',
				user_id: user?.id,
				data: 'fdafdas',
				is_published: false,
			});
		}
		await api.test_users.selectMany({
			include: {
				posts: {
					select: {
						name: true,
						user_id: true,
					},
				},
			},
		});
		await api.ky
			.selectFrom('test_users')
			.limit(1)
			.innerJoin('test_posts', 'test_posts.user_id', 'test_users.id')
			.selectAll()
			.execute();
	},
};