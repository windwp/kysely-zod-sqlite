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
  BatchResult,
  OneActionBody,
} from './types';
import { SqliteSerializePlugin } from './serialize/sqlite-serialize-plugin';
import { jsonArrayFrom, jsonObjectFrom } from './helpers/sqlite';
import { z } from 'zod';
import { uid } from 'uid';

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
      plugins: [
        new SqliteSerializePlugin({
          schema: schema.shape,
          logger: config.logger,
        }),
      ],
    });
  }

  get db() {
    return this.#db;
  }
  protected execQuery(body: any, options?: ApiOptions) {
    body.opts = options ?? this.config.options;
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
    sqlQuery: { compile: () => CompiledQuery<T> } | RawBuilder<T>,
    batchParams: Array<readonly any[]>,
    opts?: ApiOptions
  ): Promise<ExtractResultFromQuery<V>[]> {
    return this.execQuery(this.$batchOneSmt(sqlQuery, batchParams), opts)
      ?.batch;
  }

  $batchOneSmt(
    sqlQuery: { compile: () => CompiledQuery<T> } | RawBuilder<T>,
    batchParams: Array<readonly any[]>
  ): OneActionBody {
    const query =
      sqlQuery instanceof RawBuilder
        ? sqlQuery.compile(this.db)
        : sqlQuery.compile();
    return {
      action: 'batchOneSmt',
      sql: query.sql,
      batchParams,
    };
  }

  async bulk<V extends string>(
    operations:
      | {
          [key in V]:
            | OneActionBody
            | { compile: () => CompiledQuery<T> }
            | RawBuilder<T>;
        },
    opts?: ApiOptions & { isTransaction: boolean }
  ) {
    const ops: Array<OneActionBody & { key: string }> = Object.keys(
      operations
    ).map((k: any) => {
      const value = operations[k as V];
      if ((value as any).compile) {
        const query: CompiledQuery<T> =
          value instanceof RawBuilder
            ? value.compile(this.db)
            : (value as any).compile();

        const tableName = (query.query as any).from?.froms[0]?.table.identifier
          ?.name;
        return {
          key: k,
          sql: query.sql,
          tableName: tableName,
          action: query.query.kind === 'SelectQueryNode' ? 'selectAll' : 'run',
          parameters: query.parameters,
        };
      }
      return {
        key: k,
        ...value,
      } as any;
    });
    const body: DataBody = {
      action: 'bulks',
      isTransaction: opts?.isTransaction ?? false,
      operations: ops,
    };
    const data: BatchResult = await this.execQuery(body, opts);
    console.log('data', data);

    return {
      data: data.rows,
      getOne: <X = any>(key: V, tableName?: keyof T): X | undefined => {
        const v = data.rows.find(o => o.key === key);
        if (!v) throw new Error(`wrong key ${key}`);
        const name =
          tableName ??
          body.operations.find(o => o.key === key)?.tableName ??
          '';
        return this.parseOne(v.results, name as any);
      },
      getMany: <X = any>(key: V, tableName?: string): X[] => {
        const v = data.rows.find(o => o.key === key);
        if (!v) throw new Error(`wrong key ${key}`);
        const name =
          tableName ??
          body.operations.find(o => o.key === key)?.tableName ??
          '';
        return this.parseMany(v.results, name as any);
      },
    };
  }

  async batchAllSmt(
    sqlQuerys: Array<{ compile: () => CompiledQuery<T> }>,
    opts?: ApiOptions
  ) {
    const body = {
      action: 'batchAllSmt',
      batch: sqlQuerys.map(o => {
        const v = o.compile();
        const tableName = (v.query as any).from?.froms[0]?.table.identifier
          ?.name;
        return {
          sql: v.sql,
          parameters: v.parameters,
          action: v.query.kind === 'SelectQueryNode' ? 'selectAll' : 'run',
          tableName: tableName,
        };
      }),
    };
    const data: { rows: any[] } = await this.execQuery(body, opts);
    return {
      data: data.rows,
      getOne: <X = any>(index: number): X | undefined => {
        return this.parseOne(data.rows[index], body.batch[index].tableName);
      },
      getMany: <X = any>(index: number): X[] => {
        return this.parseMany(data.rows[index], body.batch[index].tableName);
      },
    };
  }

  parseOne<X = any>(data: any, tableName: keyof T) {
    if (!data || !(this.schema as any).shape[tableName]) return data;
    return (this.schema as any).shape[tableName]?.parse(data) as X;
  }

  parseMany<X = any>(data: any[], tableName: keyof T) {
    if (!(this.schema as any).shape[tableName]) return data;
    return data.map(o =>
      (this.schema as any).shape[tableName]?.parse(o)
    ) as X[];
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
/**
 * Save some litte time because I migration from prisma and
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
    return this.$updateById(id, v).execute();
  }

  $updateById(id: string, v: Partial<V>) {
    (v as any).updatedAt = new Date();
    return this.db
      .updateTable(this.tableName)
      .where('id', '=', id as any)
      .set(v as any);
  }

  updateMany(opts: ShortQuery<V> & { data: Partial<V> }) {
    return this.$updateMany(opts).executeTakeFirst();
  }

  $updateMany(opts: ShortQuery<V> & { data: Partial<V> }) {
    let query = this.db.updateTable(this.tableName);
    query = mappingQueryOptions(query, opts, false);
    (opts.data as any).updatedAt = new Date();
    return query.set(opts.data as any);
  }

  insertOne(value: Partial<V> & { id?: string }) {
    return this.$insertOne(value).executeTakeFirst();
  }

  $insertOne(value: Partial<V> & { id?: string }) {
    if (!value.id) value.id = uid();
    // @ts-ignore
    if (!value.createdAt) value.createdAt = new Date();
    // @ts-ignore
    if (!value.updatedAt) value.updatedAt = new Date();
    return this.db.insertInto(this.tableName).values(value as any);
  }

  insertMany(values: Array<Partial<V> & { id?: string }>) {
    return this.$insertMany(values).execute();
  }

  $insertMany(values: Array<Partial<V> & { id?: string }>) {
    values.forEach((o: any) => {
      if (!o.id) o.id = uid();
      if (!o.createdAt) o.createdAt = new Date();
      if (!o.updatedAt) o.updatedAt = new Date();
    });
    return this.db.insertInto(this.tableName).values(values as any);
  }

  deleteById(id: string) {
    return this.$deleteById(id).execute();
  }

  $deleteById(id: string) {
    return this.db.deleteFrom(this.tableName).where('id', '=', id as any);
  }

  deleteMany(opts: { where?: QueryWhere<V> }) {
    return this.$deleteMany(opts).execute();
  }

  $deleteMany({ where }: { where?: QueryWhere<V> }) {
    let query = this.db.deleteFrom(this.tableName);
    query = mappingQueryOptions(query, { where }, false);
    return query;
  }

  async count({ where }: { where: QueryWhere<V> }) {
    let query = this.db.selectFrom(this.tableName);
    query = query.select(eb => eb.fn.count('id').as('count'));
    query = mappingQueryOptions(query, { where }, false);
    const data: any = await query.executeTakeFirst();
    return data?.count;
  }
}
