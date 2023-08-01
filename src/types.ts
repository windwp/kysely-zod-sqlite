import type { ComparisonOperatorExpression, SelectQueryBuilder } from 'kysely';
import type { Logger } from 'loglevel';
import type { ZodObject } from 'zod';

export type DbConfig = {
  apiUrl: string;
  database: string;
  apiKey: string;
  logger?: Logger;
  options?: ApiOptions;
};
export type ApiOptions = {
  retry?: number;
  showSql?: boolean;
};

export type OneActionBody =
  | {
      action: 'selectFirst' | 'run' | 'selectAll';
      sql: string;
      parameters: readonly any[];
    }
  | {
      action: 'batchOneSmt';
      sql: string;
      parameters: Array<readonly any[]>;
    }
  | {
      action: 'batchAllSmt';
      batch: {
        sql: string;
        table: string;
        parameters: readonly any[];
        action: 'selectFirst' | 'run' | 'selectAll';
      }[];
    };
export type DataBody =
  | OneActionBody
  | {
      action: 'bulks';
      isTransaction: boolean;
      operations: Array<OneActionBody & { key: string; table?: string }>;
    };

export type TableRelation = {
  ref: string;
  table: string;
  refTarget: string;
  select?: string[];
  schema?: ZodObject<any, any>;
  type: 'many' | 'one';
};

export type TableDefinition<T> = {
  schema?: ZodObject<any, any>;
  table: keyof T & string;
  timeStamp?: boolean;
  relations?: {
    [key: string]: TableRelation;
  };
};

export type ZodSchema = {
  [key: string]: ZodObject<any, any>;
};

export type QueryWhere<V> = {
  [k in keyof V]?:
    | V[k]
    | {
        [key in ComparisonOperatorExpression & string]?: any;
      };
};

export type Query<V> = {
  select?: Readonly<Array<keyof V>>;
  where?: QueryWhere<V>;
  skip?: number;
  take?: number;
  orderBy?: {
    [k in keyof V]?: 'asc' | 'desc';
  };
};

export type QueryRelations<V, R> = Query<V> & {
  include?: {
    [k in keyof R]?:
      | boolean
      | {
          select: Array<keyof V>;
        };
  };
};

export type BatchResult = {
  rows: { key: string; results: any[]; table: string }[];
};

export interface Apdater {
  fetch(body: DataBody, _dbConfig: DbConfig): Promise<any>;
}

export type ExtractResultFromQuery<T> = T extends SelectQueryBuilder<
  any,
  any,
  infer Z
>
  ? Z
  : never;