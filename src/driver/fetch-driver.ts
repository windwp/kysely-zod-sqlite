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
    if ((compiledQuery as any).batch) {
      (compiledQuery as any).batch = Object.keys(
        (compiledQuery as any).batch
      ).map((k: string) => {
        const v = (compiledQuery as any).batch[k];
        return {
          action: v.query.kind === 'SelectQueryNode' ? 'selectAll' : 'run',
          sql: v.sql,
          parameters: v.parameters,
        };
      });
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
    } else {
      this.#config.logger?.debug('body', body);
    }

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
      return Promise.resolve({
        insertId: results.results?.lastInsertRowId
          ? BigInt(results.results?.lastInsertRowId)
          : undefined,
        rows: results.results,
        batch: results.batch,
        numAffectedRows: results.results?.changes ?? undefined,
      });
    } else {
      this.#config.logger?.error('[FetchDriver] Error');
      this.#config.logger?.error(`${await res.text()}`);
      return Promise.resolve({
        insertId: undefined,
        rows: [],
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await, require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('FetchConnection does not support streaming');
  }
}
