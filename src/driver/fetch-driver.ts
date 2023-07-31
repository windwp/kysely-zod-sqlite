import type {
  CompiledQuery,
  DatabaseConnection,
  Driver,
  QueryResult,
} from 'kysely';
import { DbConfig } from '../types';

export class FetchDriver implements Driver {
  #config: DbConfig;

  constructor(config: DbConfig) {
    this.#config = config;
  }

  async init(): Promise<void> {
    // Nothing to do here.
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async acquireConnection(): Promise<DatabaseConnection> {
    return new FetchConnection(this.#config);
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

class FetchConnection implements DatabaseConnection {
  #config: DbConfig;

  constructor(config: DbConfig) {
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
      const res = await fetch(this.#config.apiUrl, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.#config.apiKey,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const results = await res.json();
        return {
          insertId: results.results?.lastInsertRowId
            ? BigInt(results.results?.lastInsertRowId)
            : undefined,
          rows: results.results,
          batch: results.batch,
          numAffectedRows: results.results?.changes ?? undefined,
        } as any;
      }
    } catch (error: any) {
      this.#config.logger?.error(error.message);
    }

    this.#config.logger?.error('[FetchDriver] Error');
    this.#config.logger?.error(body);
    return {
      insertId: undefined,
      rows: [],
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await, require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('FetchConnection does not support streaming');
  }
}
