import type {
  ColumnType,
  ComparisonOperatorExpression,
  SelectQueryBuilder,
} from 'kysely';
import type { ZodObject } from 'zod';
import type { Fetcher } from '@cloudflare/workers-types';
import type { IsAny } from 'type-fest';
import type { z } from 'zod';
import type { Logger } from 'loglevel';

export type ApiConfig = {
  options?: ApiOptions;
  database?: string;
  logger?: Logger;
  /* auto generate uuid if id is zodString */
  autoIdFnc?: (tableName: string, value: any) => string;
  /* analyze performace of query and meta result */
  analyzeFnc?: (query: { sql: string; meta: string; time: number }) => void;
};
export type DbDriverConfig = ApiConfig;
export type FetchDriverConfig = ApiConfig & {
  apiUrl: string;
  apiKey: string;
  binding?: Fetcher;
};
export type BettterDriverConfig = {
  logger?: Logger;
  analyzeFnc?: (query: { sql: string; meta: string; time: number }) => void;
};

export type ApiOptions = {
  /* change request header */
  requestHeader?: (body: any) => Record<string, any>;
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
  type?: 'many' | 'one';
};

export type TableDefinition<T> = {
  schema?: ZodObject<any, any>;
  table: keyof T & string;
  timeStamp?: boolean;
  relations?: {
    [key: string]: TableRelation;
  };
};

export type QueryWhere<V> = {
  [k in keyof V]?:
    | V[k]
    | {
        [key in ComparisonOperatorExpression & string]?: any;
      };
};

export type Query<V> = {
  select?: {
    [k in keyof V]?: boolean;
  };
  where?: QueryWhere<V>;
  skip?: number;
  take?: number;
  orderBy?: {
    [k in keyof V]?: 'asc' | 'desc';
  };
};
export type ZodSchemaToKysely<Schema extends ZodObject<any, any, any>> = {
  [table in keyof z.output<Schema>]: {
    [column in keyof z.output<Schema>[table]]: ColumnType<
      z.output<Schema>[table][column],
      z.input<Schema>[table][column],
      z.input<Schema>[table][column]
    >;
  };
};

export type ExtractFieldsWithRelations<T> = {
  [K in keyof T as NonNullable<T[K]> extends
    | { __relations?: any }
    | { __relations?: any }[]
    ? IsAny<T[K]> extends true
      ? never
      : K
    : never]: T[K];
};

export type QueryRelations<V> = Query<V> & {
  include?: {
    [k in keyof ExtractFieldsWithRelations<V>]?:
      | boolean
      | (V[k] extends Array<infer X> | undefined
          ? {
              select: {
                [field in keyof Omit<X, '__relations'>]?: boolean;
              };
            }
          : {
              select: k extends keyof V
                ? {
                    [field in keyof Omit<
                      NonNullable<V[k]>,
                      '__relations'
                    >]?: boolean;
                  }
                : never;
            });
  };
};

export type BatchResult = {
  rows: { key: string; results: any[]; table: string }[];
  error?: any;
};

export type InsertTable<T extends { id: string | number }> = {
  id?: T['id'] | undefined;
} & {
  [K in keyof T as NonNullable<T[K]> extends
    | { __relations?: any }
    | { __relations?: any }[]
    ? never
    : K]: T[K];
};

export type ExtractResultFromQuery<T> = T extends SelectQueryBuilder<
  any,
  any,
  infer Z
>
  ? Z
  : never;
