import {
  Kysely,
  SelectQueryBuilder,
  InsertQueryBuilder,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  Driver,
  CompiledQuery,
  RawBuilder,
} from 'kysely';
import {
  DbConfig,
  DataBody,
  ApiOptions,
  ShortQuery,
  QueryWhere,
  ShortQueryRelations,
  TableRelation,
} from './types';
import { SqliteSerializePlugin } from './serialize';
import { jsonObjectFrom } from 'kysely/helpers/mysql';
import { jsonArrayFrom } from './helpers/sqlite';
import { z } from 'zod';

export interface Apdater {
  fetch(body: DataBody, _dbConfig: DbConfig): Promise<any>;
}

type ExtractResultFromQuery<T> = T extends SelectQueryBuilder<any, any, infer Z>
  ? Z
  : never;

export class SqliteApi<T> {
  readonly #db: Kysely<T>;
  readonly config: DbConfig;
  readonly schema: z.Schema<T>;

  constructor({
    config,
    schema,
    driver,
  }: {
    config: DbConfig;
    schema: any;
    driver: Driver;
  }) {
    this.config = config;
    this.schema = schema;
    this.#db = new Kysely<T>({
      dialect: {
        createAdapter: () => new SqliteAdapter(),
        createIntrospector: o => new SqliteIntrospector(o),
        createQueryCompiler: () => new SqliteQueryCompiler(),
        createDriver: () => driver,
      },
      plugins: [new SqliteSerializePlugin({ schema: schema.shape })],
    });
  }

  get db() {
    return this.#db;
  }
  protected execQuery(body: any, options?: ApiOptions) {
    const opts = options || this.config.options;
    body.opts = opts;
    return this.#db.executeQuery(body) as any;
  }

  run(
    sqlQuery: { compile: () => CompiledQuery<T> },
    opts?: ApiOptions
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    const query = sqlQuery.compile();
    const body: DataBody = {
      action: 'run',
      sql: query.sql,
      parameters: query.parameters,
    };
    return this.execQuery(body, opts);
  }

  runSql<T = any>(
    sqlQuery: RawBuilder<T>,
    opts?: ApiOptions
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    const query = sqlQuery.compile(this.db);
    const body: DataBody = {
      action: 'run',
      sql: query.sql,
      parameters: query.parameters,
    };
    return this.execQuery(body, opts);
  }

  allSql<T = any>(sqlQuery: RawBuilder<T>, opts?: ApiOptions): Promise<T[]> {
    const query = sqlQuery.compile(this.db);
    const body: DataBody = {
      action: 'selectAll',
      sql: query.sql,
      parameters: query.parameters,
    };
    return this.execQuery(body, opts);
  }

  /**
   * use this api to excute one sql query with multiple parameters
   * https://developers.cloudflare.com/d1/platform/client-api/#dbbatch
   */
  batchOneSmt<
    V extends SelectQueryBuilder<T, any, any> | InsertQueryBuilder<T, any, any>
  >(
    sqlQuery: { compile: () => CompiledQuery<T> },
    batchParams: Array<readonly any[]>,
    opts?: ApiOptions
  ): Promise<ExtractResultFromQuery<V>[]> {
    const query = sqlQuery.compile();
    const body: DataBody = {
      action: 'batchOneSmt',
      sql: query.sql,
      batchParams,
    };
    return this.execQuery(body, opts);
  }

  /**
   * use this api to excute multiple sql query on one batch operation
   * https://developers.cloudflare.com/d1/platform/client-api/#dbbatch
   */
  async batchAllSmt(
    sqlQuerys: { compile: () => CompiledQuery<T> }[],
    opts?: ApiOptions
  ) {
    Object.values(sqlQuerys).forEach(o => o.compile());

    const table: string[] = [];
    const cq = sqlQuerys.map(q => {
      const v = q.compile();
      const tableName = (v.query as any).from?.froms[0]?.table.identifier?.name;
      table.push(tableName);
      return v;
    });
    const body: DataBody = {
      action: 'batchAllSmt',
      batch: cq as any,
    };
    const data = await this.execQuery(body, opts);

    return {
      data: data.batch,
      /* parse data with zod schema and mapping type */
      getFirst: <X = any>(index: number, tableName?: string): X | undefined => {
        if (!data.batch[index]) return undefined;
        tableName = tableName ?? table[index];
        if (!tableName || !(this.schema as any).shape[tableName])
          return data.batch[index];
        return (this.schema as any).shape[tableName].parse(data.batch[index]);
      },
      /* parse data with zod schema and mapping type */
      getMany: <X = any>(index: number, tableName?: string): X[] => {
        if (!data.batch[index]) return [];
        tableName = tableName ?? table[index];
        if (!tableName || !(this.schema as any).shape[tableName])
          return data.batch[index];
        return data.batch[index].map(
          (this.schema as any).shape[tableName].parse
        ) as X[];
      },
    };
  }

  table<V>() {
    const fn = <
      R extends {
        tableName: keyof T & string;
        relations?: {
          [key: string]: TableRelation;
        };
      }
    >(
      innerTable: R
    ) => {
      return new PQuery<V, R>(this.db, innerTable);
    };
    return {
      create: fn,
    };
  }
}

function mappingQueryOptions<V, R>(
  query: any,
  opts: ShortQueryRelations<V, R>,
  autoSelecAll = true
) {
  if (autoSelecAll) {
    if (opts.select) query = query.select(opts.select as any);
    else query = query.selectAll();
  }
  if (opts.where) {
    for (const key in opts.where) {
      if (typeof opts.where[key] === 'object') {
        query = query.where(
          key as any,
          Object.keys(opts.where[key] as any)[0] as any,
          Object.values(opts.where[key] as any)[0] as any
        );
      } else {
        query = query.where(key, '=', opts.where[key]);
      }
    }
  }
  if (opts?.skip) query = query.offset(opts.skip);
  if (opts?.take) query = query.limit(opts.take);
  if (opts?.orderBy) {
    for (const key in opts.orderBy) {
      query = query.orderBy(key, opts.orderBy[key]);
    }
  }

  return query;
}
function mappingRelations<V, R>(
  query: any,
  tableName: string,
  relations: { [k: string]: TableRelation },
  opts: ShortQueryRelations<V, R>
) {
  if (opts.include) {
    for (const key in opts.include) {
      const relation = relations[key];
      const iSelect = opts.include[key];
      if (!relation) throw new Error(`relation ${key} not found`);
      const columns =
        typeof iSelect === 'boolean' ? relation.select : iSelect?.select;
      const fncJson =
        relation.type == 'OneToOne' ? jsonObjectFrom : jsonArrayFrom;
      query = query.select((eb: any) => [
        fncJson(
          eb
            .selectFrom(relation.table as any)
            .select(columns)
            .whereRef(
              `${tableName}.${relation.ref}` as any,
              '=',
              relation.refTarget as any
            )
        ).as(relation.alias),
      ]);
    }
  }
  return query;
}

type VRelations<Table> = Table extends { relations?: infer X } ? X : never;
// export type Relations<VTable> =
/**
 * Save some litte time because I migration from prisma and
 * too many (as any) 😄
 */
export class PQuery<
  V,
  VTable extends {
    tableName: keyof T & string;
    relations?: {
      [key: string]: TableRelation;
    };
  },
  T extends { [K in keyof T]: { id: string } } = any
> {
  private tableName: keyof T & string;
  private relations?: { [key: string]: TableRelation };
  constructor(private readonly db: Kysely<T>, config: VTable) {
    this.db = db;
    this.tableName = config.tableName;
    this.relations = config.relations;
  }

  selectById(id: string, select?: Array<keyof V>) {
    return this.$selectFirst({
      where: { id } as any,
      select,
    }).executeTakeFirst() as Promise<V>;
  }

  selectMany(opts: ShortQueryRelations<V, VRelations<VTable>>) {
    return this.$selectMany(opts).execute() as Promise<V[]>;
  }

  $selectMany(opts: ShortQueryRelations<V, VRelations<VTable>>) {
    let query = this.db.selectFrom(this.tableName);
    query = mappingQueryOptions(query, opts);
    if (this.relations)
      query = mappingRelations(query, this.tableName, this.relations, opts);
    return query;
  }

  selectFirst(opts: ShortQueryRelations<V, VRelations<VTable>>) {
    opts.take = 1;
    return this.$selectMany(opts).executeTakeFirst() as Promise<V | undefined>;
  }

  $selectFirst(opts: ShortQueryRelations<V, VRelations<VTable>>) {
    opts.take = 1;
    return this.$selectMany(opts);
  }

  updateById(id: string, v: Partial<V>) {
    return this.db
      .updateTable(this.tableName)
      .where('id', '=', id as any)
      .set(v as any)
      .execute();
  }

  updateMany(opts: ShortQuery<V> & { data: Partial<V> }) {
    let query = this.db.updateTable(this.tableName);
    query = mappingQueryOptions(query, opts, false);
    return query.set(opts.data as any).executeTakeFirst();
  }

  insertMany(values: Array<Partial<V>>) {
    return this.db
      .insertInto(this.tableName)
      .values(values as any)
      .execute();
  }

  deleteById(id: string) {
    return this.db
      .deleteFrom(this.tableName)
      .where('id', '=', id as any)
      .execute();
  }

  deleteMany({ where }: { where?: QueryWhere<V> }) {
    let query = this.db.deleteFrom(this.tableName);
    query = mappingQueryOptions(query, { where }, false);
    return query.execute();
  }

  async count({ where }: { where: QueryWhere<V> }) {
    let query = this.db.selectFrom(this.tableName);
    query = query.select(eb => eb.fn.count('id').as('count'));
    query = mappingQueryOptions(query, { where }, false);
    const data: any = await query.executeTakeFirst();
    return data?.count;
  }
}
