import type {
  CompiledQuery,
  DatabaseConnection,
  Driver,
  QueryResult,
} from 'kysely';
import { DataBody, DbConfig } from '../types';
import { D1Database, D1Result } from '@cloudflare/workers-types';

export class D1Driver implements Driver {
  #config: DbConfig;
  #d1: D1Database;

  constructor(d1: D1Database, config: DbConfig) {
    this.#config = config;
    this.#d1 = d1;
  }

  async init(): Promise<void> {
    // Nothing to do here.
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async acquireConnection(): Promise<DatabaseConnection> {
    return new D1Connection(this.#d1, this.#config);
  }

  async beginTransaction(): Promise<void> {
    // Nothing to do here.
  }

  async commitTransaction(): Promise<void> {
    // Nothing to do here.
  }

  async rollbackTransaction(): Promise<void> {
    // Nothing to do here.
  }

  async releaseConnection(): Promise<void> {
    // Nothing to do here.
  }

  async destroy(): Promise<void> {
    // Nothing to do here.
  }
}

// my handler focus on support batch with cloudflare
async function D1Handler(
  d1: D1Database,
  body: DataBody
): Promise<D1Result<any>> {
  switch (body.action) {
    case 'run': {
      return await d1
        .prepare(body.sql)
        .bind(...body.parameters)
        .run();
    }
    case 'selectFirst':
      // @ts-ignore
      return d1
        .prepare(body.sql)
        .bind(...body.parameters)
        .first();
    case 'selectAll':
      return d1
        .prepare(body.sql)
        .bind(...body.parameters)
        .all();
    case 'batchOneSmt': {
      const stmt = d1.prepare(body.sql);
      const v = await d1.batch(
        body.batchParams.map((o: any) => stmt.bind(...o))
      );
      return {
        meta: v[0]?.meta,
        success: v?.[0].success,
        results: v?.[0].results,
        batch: v,
      } as any;
    }
    case 'batchAllSmt': {
      const v = await d1.batch(
        body.batch.map((o: any) => {
          return d1.prepare(o.sql).bind(...o.params);
        })
      );
      return {
        meta: v[0]?.meta,
        success: v?.[0].success,
        results: v?.[0].results,
      };
    }
    case 'bulks': {
      const result: D1Result = {
        results: [],
        success: true,
        meta: {},
      };
      for (const op of body.operations) {
        const data = await D1Handler(d1, op);
        result.results.push({
          key: op.key,
          results: data.results,
        });
      }
      return result;
    }

    default:
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Unknown command :${body.action}`);
  }
}
class D1Connection implements DatabaseConnection {
  #config: DbConfig;
  #d1: D1Database;

  constructor(d1: D1Database, config: DbConfig) {
    this.#d1 = d1;
    this.#config = config;
  }

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
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
      const results = await D1Handler(this.#d1, body);
      const numAffectedRows =
        results.meta.changes > 0 ? BigInt(results.meta.changes) : undefined;
      return {
        insertId:
          results.meta.last_row_id === undefined ||
          results.meta.last_row_id === null
            ? undefined
            : BigInt(results.meta.last_row_id),
        rows: (results.results as O[]) || [],
        batch: (results as any).batch,
        numAffectedRows,
        // @ts-ignore deprecated in kysely >= 0.23, keep for backward compatibility.
        numUpdatedOrDeletedRows: numAffectedRows,
      } as any;
    } catch (error: any) {
      this.#config.logger?.error('[SQL_ERROR=========================');
      this.#config.logger?.error(error.message);
      this.#config.logger?.error(body.sql);
      this.#config.logger?.error(body.parameters);
      this.#config.logger?.error('===================================]');
      return { rows: [], insertId: undefined };
    }
  }

  // eslint-disable-next-line
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('FetchConnection does not support streaming');
  }
}
