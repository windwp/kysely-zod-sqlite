import { handler } from 'kysely-zod-sqlite/driver/d1-driver';
export interface Env {
	D1_DB: D1Database;
	DB_API_KEY: string;
}

export default {
	async fetch(request: Request, env: Env, _: ExecutionContext): Promise<Response> {
		const apiKey = request.headers.get('api-key');
		if (apiKey != env.DB_API_KEY) {
			return new Response('Error', {
				status: 401,
			});
		}

		const body = await request.json();

		try {
			const result = await handler(env.D1_DB, body);

			return new Response(JSON.stringify(result), {
				headers: { 'Content-Type': 'application/json' },
			});
		} catch (error: any) {
			// hide error log on production
			return new Response(JSON.stringify({ error: error.message }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	},
};
