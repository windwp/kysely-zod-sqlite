import type {
  CompiledQuery,
  DatabaseConnection,
  Driver,
  QueryResult,
} from 'kysely';
import { FetchConfig } from '../types';

class FetchConnection implements DatabaseConnection {
  #config: FetchConfig;

  constructor(config: FetchConfig) {
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

    try {
      const req = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.#config.apiKey,
          cache: 'no-cache, no-store',
        },
        body: JSON.stringify(body),
      } as const;
      let res: Response;
      if (this.#config.binding?.fetch) {
        res = (await this.#config.binding.fetch(
          this.#config.apiUrl,
          req
        )) as unknown as Response;
      } else {
        res = await fetch(this.#config.apiUrl, req);
      }
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
      return { rows: [], error: await res.text(), numAffectedRows: BigInt(0) };
    } catch (error: any) {
      this.#config.logger?.error(
        `[FetchDriver] ${this.#config.apiUrl} Error: ${error.message}`
      );
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await, require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('FetchConnection does not support streaming');
  }
}
export class FetchDriver implements Driver {
  #config: FetchConfig;

  constructor(config: FetchConfig) {
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
