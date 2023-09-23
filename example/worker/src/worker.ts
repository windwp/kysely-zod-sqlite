import { handler } from 'kysely-zod-sqlite/driver/d1-driver';

export interface Env {
	D1_DB: D1Database;
	DB_API_KEY: string;
}
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Content-Type': 'application/json',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
	'Access-Control-Allow-Credentials': 'true',
};
export default {
	async fetch(
		request: Request,
		env: Env,
		_: ExecutionContext
	): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response('OK', { headers: corsHeaders, status: 200 });
		}
		const apiKey = request.headers.get('api-key');

		if (apiKey != env.DB_API_KEY) {
			return new Response('Error', { status: 401 });
		}

		const body: any = await request.json();
		// TODO validation body

		try {
			const result = await handler(env.D1_DB, body);

			return new Response(JSON.stringify(result), {
				headers: corsHeaders,
			});
		} catch (error: any) {
			console.error('error', error);
			// send error to browser for debug
			return new Response(JSON.stringify({ error: error.message }), {
				status: 500,
				headers: corsHeaders,
			});
		}
	},
};
