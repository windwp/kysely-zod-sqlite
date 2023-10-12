import type {
  CompiledQuery,
  DatabaseConnection,
  Driver,
  QueryResult,
} from 'kysely';
import { DataBody } from '../types';
import { Database } from 'better-sqlite3';

interface BettterDriverConfig {
  logger?: any;
  analyzeFnc?: (query: { sql: string; meta: string; time: number }) => void;
}
export class BetterSqlite3Driver implements Driver {
  #config: BettterDriverConfig;
  #db: Database;

  constructor(db: Database, config: BettterDriverConfig) {
    this.#config = config;
    this.#db = db;
  }

  async init(): Promise<void> {
    // Nothing to do here.
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async acquireConnection(): Promise<DatabaseConnection> {
    return new BetterConnection(this.#db, this.#config);
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

export function handler(db: Database, body: DataBody) {
  const result: {
    success: boolean;
    meta: any;
    results: any;
  } = {
    success: true,
    meta: {},
    results: [],
  };
  switch (body.action) {
    case 'run':
      result.results = db
        .prepare(body.sql)
        .bind(...body.parameters)
        .run();
      break;
    case 'selectFirst':
      result.results = [
        db
          .prepare(body.sql)
          .bind(...body.parameters)
          .get(),
      ];
      break;
    case 'selectAll':
      result.results = db
        .prepare(body.sql)
        .bind(...body.parameters)
        .all();
      break;
    case 'batchOneSmt': {
      const stmt = db.prepare(body.sql);
      for (const v of body.parameters) {
        result.results.push(stmt.run(v));
      }
      break;
    }
    case 'batchAllSmt': {
      if (body.batch) {
        for (const v of body.batch) {
          if (v.action === 'selectAll') {
            result.results.push(db.prepare(v.sql).all(...v.parameters));
          } else {
            result.results.push(db.prepare(v.sql).run(...v.parameters));
          }
        }
      }
      break;
    }
    case 'bulks': {
      if (body.operations) {
        if (body.isTransaction) {
          db.transaction(() => {
            for (const op of body.operations) {
              const data = handler(db, op);
              result.results.push({
                key: op.key,
                results: data.results,
              });
            }
          })();
        } else {
          for (const op of body.operations) {
            const data = handler(db, op);
            result.results.push({
              key: op.key,
              results: data.results,
            });
          }
        }
      }
      break;
    }
    default:
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Unknown command :${body.action}`);
  }
  return result;
}
class BetterConnection implements DatabaseConnection {
  #config: BettterDriverConfig;
  #db: Database;

  constructor(db: Database, config: BettterDriverConfig) {
    this.#db = db;
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

    const { query, ...rest } = compiledQuery;
    const body = {
      action,
      ...rest,
    };

    const timeStart = this.#config.analyzeFnc ? performance.now() : 0;
    this.#config.logger?.debug(body);

    try {
      const results = handler(this.#db, body);

      if (timeStart) {
        this.#config.analyzeFnc?.({
          sql: body.sql,
          meta: results.meta,
          time: performance.now() - timeStart,
        });
      }
      return {
        insertId: results.results?.lastInsertRowid
          ? BigInt(results.results?.lastInsertRowid)
          : undefined,
        rows: results.results,
        numAffectedRows: results.results?.changes ?? undefined,
      };
    } catch (error: any) {
      this.#config.logger?.error(`[SQL_ERROR=========================
${error.message}
${body.sql}
${body.parameters}
===================================]`);
      throw error;
    }
  }

  // eslint-disable-next-line
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('FetchConnection does not support streaming');
  }
}
