import type {
    CompiledQuery,
    DatabaseConnection, QueryResult
} from 'kysely';
import { DbConfig } from '../types';
import { D1Database } from '@cloudflare/workers-types';
import { handler } from './d1-driver';

export class D1Connection implements DatabaseConnection {
    #config: DbConfig;
    #d1: D1Database;

    constructor(d1: D1Database, config: DbConfig) {
        this.#d1 = d1;
        this.#config = config;
    }

    async executeQuery<T>(
        compiledQuery: CompiledQuery
    ): Promise<QueryResult<T> & { error?: any; }> {
        let action = (compiledQuery as any).action;

        if (!action) {
            action =
                compiledQuery.query.kind === 'SelectQueryNode' ? 'selectAll' : 'run';
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { query, ...rest } = compiledQuery;
        const body = {
            action,
            database: this.#config.database,
            ...rest,
        };
        if ((compiledQuery as any).opts?.showSql) {
            this.#config.logger?.info(`SQL: ${body.sql}`);
        }
        this.#config.logger?.debug(body);

        try {
            const results = await handler(this.#d1, body);
            const numAffectedRows = results.meta?.changes > 0 ? results.meta?.changes : undefined;
            return {
                insertId: results.meta.last_row_id ?? undefined,
                rows: results.results || [],
                batch: results.batch,
                numAffectedRows,
            } as any;
        } catch (error: any) {
            this.#config.logger?.error('[SQL_ERROR=========================');
            this.#config.logger?.error(error.message);
            this.#config.logger?.error(body.sql);
            this.#config.logger?.error(body.parameters);
            this.#config.logger?.error('===================================]');
            return { rows: [], error: error };
        }
    }

    // eslint-disable-next-line
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
        throw new Error('FetchConnection does not support streaming');
    }
}

