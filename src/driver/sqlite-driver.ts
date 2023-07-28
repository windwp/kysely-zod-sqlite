import type {
  CompiledQuery,
  DatabaseConnection,
  Driver,
  QueryResult,
} from 'kysely';
import { DataBody } from '../types';
import { Database } from 'better-sqlite3';

interface BettterDriverConfig {
  database: string;
  logger?: any;
}
export class BetterDriver implements Driver {
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
      for (const v of body.batchParams) {
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

    this.#config.logger?.debug('body', body);
    if ((compiledQuery as any).opts?.showSql) {
      this.#config.logger?.info(`SQL: ${body.sql}`);
    }

    try {
      const results = await Promise.resolve(handler(this.#db, body));
      console.log('results', results);
      return Promise.resolve({
        insertId: results.results?.lastInsertRowId
          ? BigInt(results.results?.lastInsertRowId)
          : undefined,
        rows: results.results,
        batch: (results as any).batch,
        numAffectedRows: results.results?.changes ?? undefined,
      } as any);
    } catch (error: any) {
      this.#config.logger.error('[SQL_ERROR]=========================');
      this.#config.logger.error(body.sql);
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`${error.message}\n ${body.sql}`);
    }
  }

  // eslint-disable-next-line
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('FetchConnection does not support streaming');
  }
}
