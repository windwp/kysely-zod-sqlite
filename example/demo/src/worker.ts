import { SqliteApi, createKyselySqlite } from 'kysely-zod-sqlite';
import { D1Driver } from 'kysely-zod-sqlite/driver/d1-driver';
import { dbSchema, DbSchema } from './schema';
import logger from 'loglevel';
export class TestApi extends SqliteApi<DbSchema> {
	get TestUser() {
		return this.table('TestUser');
	}
	get TestPost() {
		return this.table('TestPost');
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
		await api.TestUser.deleteMany({});
		const user = await api.TestUser.insertOne({
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
			await api.TestPost.insertOne({
				name: 'fdsadfsa',
				userId: user?.id,
				data: 'fdafdas',
				isPublished: false,
			});
			await api.TestPost.insertOne({
				name: 'fdsadfsa',
				userId: user?.id,
				data: 'fdafdas',
				isPublished: false,
			});
		}
		await api.TestUser.selectMany({
			include: {
				posts: {
					select: {
						name: true,
						userId: true,
					},
				},
			},
		});
		await api.ky
			.selectFrom('TestUser')
			.limit(1)
			.innerJoin('TestPost', 'TestPost.userId', 'TestUser.id')
			.selectAll()
			.execute();
	},
};
