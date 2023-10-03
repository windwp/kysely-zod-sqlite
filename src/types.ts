import type { ComparisonOperatorExpression, SelectQueryBuilder } from 'kysely';
import type { Logger } from 'loglevel';
import type { ZodObject } from 'zod';
import type { Fetcher } from '@cloudflare/workers-types';
import { IsAny } from 'type-fest';

export type DbConfig = {
  logger?: Logger;
  database?: string;
  options?: ApiOptions;
  autoIdFnc?: (tableName: string, value: any) => string
};
export type FetchConfig = {
  apiUrl: string;
  apiKey: string;
  database?: string;
  binding?: Fetcher;
  logger?: Logger;
  options?: ApiOptions;
  autoIdFnc?: (tableName: string, value: any) => string
};
export type ApiOptions = {
  debugSql?: boolean;
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
