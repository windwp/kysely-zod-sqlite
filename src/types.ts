import { ComparisonOperatorExpression } from 'kysely';
import type { Logger } from 'loglevel';
import { ZodObject } from 'zod';

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
      batchParams: Array<readonly any[]>;
    }
  | {
      action: 'batchAllSmt';
      batch: {
        sql: string;
        tableName: string;
        parameters: readonly any[];
        action: 'selectFirst' | 'run' | 'selectAll';
      }[];
    };
export type DataBody =
  | OneActionBody
  | {
      action: 'bulks';
      isTransaction: boolean;
      operations: Array<OneActionBody & { key: string; tableName?: string }>;
    };

export type TableRelation = {
  ref: string;
  table: string;
  refTarget: string;
  alias: string;
  select: string[];
  type: 'OneToMany' | 'OneToOne';
};

export type TableDefinition<T> = {
  tableName: keyof T & string;
  idPrefix?: string;
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

export type ShortQuery<V> = {
  select?: Readonly<Array<keyof V>>;
  where?: QueryWhere<V>;
  skip?: number;
  take?: number;
  orderBy?: {
    [k in keyof V]?: 'asc' | 'desc';
  };
};

export type ShortQueryRelations<V, R> = ShortQuery<V> & {
  include?: {
    [k in keyof R]?:
      | boolean
      | {
          select: Array<keyof V>;
        };
  };
};

export type BatchResult = {
  rows: { key: string; results: any[]; tableName: string }[];
};
