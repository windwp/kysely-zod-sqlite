import type {
  CompiledQuery,
  DatabaseConnection,
  Driver,
  QueryResult,
} from 'kysely';
import { FetchDriverConfig } from '../types';

class FetchConnection implements DatabaseConnection {
  #config: FetchDriverConfig;

  constructor(config: FetchDriverConfig) {
    this.#config = config;
  }

  async executeQuery<O>(
    compiledQuery: CompiledQuery
  ): Promise<QueryResult<O> & { error?: any }> {
    let action = (compiledQuery as any).action;
    if (!action) {
      action =
        (compiledQuery.query as any)?.limit?.limit.value == 1
          ? 'selectFirst'
          : compiledQuery.query.kind === 'SelectQueryNode'
          ? 'selectAll'
          : 'run';
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

    const req = {
      method: 'POST',
      headers: this.#config.options?.requestHeader?.(body) || {
        'Content-Type': 'application/json',
        'api-key': this.#config.apiKey,
        cache: 'no-cache, no-store',
      },
      body: JSON.stringify(body),
    };
    const res: Response = this.#config.binding?.fetch
      ? ((await this.#config.binding.fetch(this.#config.apiUrl, req)) as any)
      : await fetch(this.#config.apiUrl, req);

    if (res?.ok) {
      const results = await res.json();
      const numAffectedRows =
        results.meta?.changes > 0 ? results.meta?.changes : undefined;
      return {
        insertId: results.meta.last_row_id ?? undefined,
        rows: results.results || [],
        numAffectedRows,
      };
    }
    const errorMessage = await res.text();
    this.#config.logger?.error(
      `[FetchDriver] ${this.#config.apiUrl} Error: ${errorMessage}`
    );
    throw new Error(errorMessage);
  }

  // eslint-disable-next-line @typescript-eslint/require-await, require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('FetchConnection does not support streaming');
  }
}
export class FetchDriver implements Driver {
  #config: FetchDriverConfig;

  constructor(config: FetchDriverConfig) {
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
