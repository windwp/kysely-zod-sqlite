import { handler } from 'kysely-zod-sqlite/driver/d1-driver';
export interface Env {
	D1_DB: D1Database;
	DB_API_KEY: string;
}

export default {
	async fetch(request: Request, env: Env, _: ExecutionContext): Promise<Response> {
		if (request.method === 'OPTIONS') {
			console.log('response cors');
			return new Response('OK', {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Headers': '*',
					'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
					'Access-Control-Allow-Credentials': 'true',
				},
				status: 200,
			});
		}
		const apiKey = request.headers.get('api-key');
		console.log('request.method', request.method);
		console.log('apiKey', apiKey);
		console.log('env.DB_API_KEY', env.DB_API_KEY);

		if (apiKey != env.DB_API_KEY) {
			return new Response('Error', { status: 401 });
		}

		const body = await request.json();

		try {
			const result = await handler(env.D1_DB, body);
			console.log('result', result);

			return new Response(JSON.stringify(result), {
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Headers': '*',
					'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
				},
			});
		} catch (error: any) {
			console.log('error', error);
			// hide error log on production
			return new Response(JSON.stringify({ error: error.message }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	},
};
