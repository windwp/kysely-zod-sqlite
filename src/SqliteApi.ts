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
  TableDefinition,
} from './types';
import { SqliteSerializePlugin } from './serialize/sqlite-serialize-plugin';
import { jsonArrayFrom, jsonObjectFrom } from './helpers/sqlite';
import { z } from 'zod';
import { pid } from './helpers/pid';

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
            | RawBuilder<T>
            | undefined;
        },
    opts?: ApiOptions & { isTransaction: boolean }
  ) {
    const ops: Array<OneActionBody & { key: string }> = Object.keys(operations)
      .map((k: any) => {
        const value = operations[k as V];
        if (!value) return undefined;
        if ((value as any).compile) {
          const query: CompiledQuery<T> =
            value instanceof RawBuilder
              ? value.compile(this.db)
              : (value as any).compile();

          const tableName = (query.query as any).from?.froms[0]?.table
            .identifier?.name;
          return {
            key: k,
            sql: query.sql,
            tableName: tableName,
            action:
              query.query.kind === 'SelectQueryNode' ? 'selectAll' : 'run',
            parameters: query.parameters,
          };
        }
        return {
          key: k,
          ...value,
        } as any;
      })
      .filter(o => o);
    const body: DataBody = {
      action: 'bulks',
      isTransaction: opts?.isTransaction ?? false,
      operations: ops,
    };
    const data: BatchResult = await this.execQuery(body, opts);

    return {
      data: data.rows,
      getOne: <X = any>(key: V, tableName?: keyof T): X | undefined => {
        const v = data.rows.find(o => o.key === key);
        if (!v) throw new Error(`wrong key ${key}`);
        const name =
          tableName ??
          body.operations.find(o => o.key === key)?.tableName ??
          '';
        if (Array.isArray(v.results)) {
          return this.parseMany(v.results, name as any)?.[0];
        }
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
        if (Array.isArray(data.rows[index])) {
          return this.parseMany(
            data.rows[index],
            body.batch[index].tableName
          )?.[0];
        }
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
    const fn = <R extends TableDefinition<T>>(innerTable: R) => {
      return new PTable<V, R>(this.db, innerTable);
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
      } else if (opts.where[key] !== undefined && opts.where[key] !== null) {
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
 * Save some litte time because I migration from prisma.
 */
export class PTable<
  V,
  VTable extends TableDefinition<T>,
  T extends { [K in keyof T]: { id: string } } = any
> {
  constructor(private readonly db: Kysely<T>, public config: VTable) {
    this.db = db;
  }

  selectById(id: string, select?: Array<keyof V>) {
    return this.$selectById(id, select).executeTakeFirst() as Promise<V>;
  }

  $selectById(id: string, select?: Array<keyof V>) {
    return this.$selectFirst({
      where: { id } as any,
      select,
    });
  }

  selectMany(opts: ShortQueryRelations<V, VRelations<VTable>>) {
    return this.$selectMany(opts).execute() as Promise<V[]>;
  }

  $selectMany(opts: ShortQueryRelations<V, VRelations<VTable>>) {
    let query = this.db.selectFrom(this.config.tableName);
    query = mappingQueryOptions(query, opts);
    if (this.config.relations)
      query = mappingRelations(
        query,
        this.config.tableName,
        this.config.relations,
        opts
      );
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

  async updateById(
    id: string,
    value: Partial<V & { id?: string }>
  ): Promise<{
    numUpdatedRows: bigint;
    numChangedRows?: bigint;
  }> {
    if (value.id) delete value.id;
    return await this.$updateById(id, value).executeTakeFirst();
  }

  $updateById(id: string, value: Partial<V>) {
    (value as any).updatedAt = new Date();
    return this.db
      .updateTable(this.config.tableName)
      .where('id', '=', id as any)
      .set(value as any);
  }

  updateMany(opts: ShortQuery<V> & { data: Partial<V> }): Promise<{
    numUpdatedRows: bigint;
    numChangedRows?: bigint;
  }> {
    return this.$updateMany(opts).executeTakeFirst();
  }

  $updateMany(opts: ShortQuery<V> & { data: Partial<V> }) {
    let query = this.db.updateTable(this.config.tableName);
    query = mappingQueryOptions(query, opts, false);
    (opts.data as any).updatedAt = new Date();
    return query.set(opts.data as any);
  }

  async updateOne(opts: ShortQuery<V> & { data: Partial<V> }): Promise<{
    numUpdatedRows: bigint;
    numChangedRows?: bigint;
  }> {
    return await this.$updateOne(opts).executeTakeFirst();
  }
  // https://stackoverflow.com/questions/10074756/update-top-in-sqlite
  $updateOne(opts: ShortQuery<V> & { data: Partial<V> }) {
    let query = this.db.updateTable(this.config.tableName);
    (opts.data as any).updatedAt = new Date();
    let selectQuery = this.db.selectFrom(this.config.tableName);
    opts.take = 1;
    opts.select = ['id'] as any;
    selectQuery = mappingQueryOptions(selectQuery, opts);
    query = query.where('id', 'in', selectQuery);
    return query.set(opts.data as any);
  }

  async insertOne(
    value: Partial<V> & { id?: string }
  ): Promise<Partial<V> & { id: string }> {
    await this.$insertOne(value).executeTakeFirst();
    return value as Partial<V> & { id: string };
  }

  $insertOne(value: Partial<V> & { id?: string }) {
    if (!value.id) value.id = pid(this.config.idPrefix);
    if (this.config.timeStamp) {
      // @ts-ignore
      if (!value.createdAt) value.createdAt = new Date();
      // @ts-ignore
      if (!value.updatedAt) value.updatedAt = new Date();
    }
    return this.db.insertInto(this.config.tableName).values(value as any);
  }

  async insertOrUpdate(
    value: Partial<V> & { id?: string }
  ): Promise<Partial<V> & { id: string }> {
    if (value.id) {
      await this.updateOne({ where: { id: value.id } as any, data: value });
      return value as any;
    }
    return this.insertOne(value);
  }

  /** conflicts columns should be a unique or primary key */
  async insertConflict(opts: {
    create: Partial<V> & { id?: string };
    update: Partial<V>;
    conflicts: Array<keyof V & string>;
  }) {
    await this.$insertConflict(opts).execute();
    return opts.create;
  }

  /** conflicts columns should be a unique or primary key */
  $insertConflict({
    create,
    update,
    conflicts,
  }: {
    create: Partial<V> & { id?: string };
    update: Partial<V>;
    conflicts: Array<keyof V & string>;
  }) {
    if (!create.id) create.id = pid(this.config.idPrefix);
    return this.db
      .insertInto(this.config.tableName)
      .values(create as any)
      .onConflict(oc =>
        oc.columns(conflicts as any).doUpdateSet(update as any)
      );
  }

  async insertMany(values: Array<Partial<V>>): Promise<V[]> {
    await this.$insertMany(values).execute();
    return values as V[];
  }

  $insertMany(values: Array<Partial<V> & { id?: string }>) {
    values.forEach((o: any) => {
      if (!o.id) o.id = pid(this.config.idPrefix);
      if (this.config.timeStamp) {
        if (!o.createdAt) o.createdAt = new Date();
        if (!o.updatedAt) o.updatedAt = new Date();
      }
    });
    return this.db.insertInto(this.config.tableName).values(values as any);
  }

  async deleteById(id: string): Promise<{ numDeletedRows: BigInt }> {
    return await this.$deleteById(id).executeTakeFirst();
  }

  $deleteById(id: string) {
    return this.db
      .deleteFrom(this.config.tableName)
      .where('id', '=', id as any);
  }

  async deleteMany(opts: {
    where?: QueryWhere<V>;
  }): Promise<{ numDeletedRows: BigInt }> {
    return await this.$deleteMany(opts).executeTakeFirst();
  }

  $deleteMany({ where }: { where?: QueryWhere<V> }) {
    let query = this.db.deleteFrom(this.config.tableName);
    query = mappingQueryOptions(query, { where }, false);
    return query;
  }

  async count({ where }: { where: QueryWhere<V> }): Promise<number> {
    let query = this.db.selectFrom(this.config.tableName);
    query = query.select(eb => eb.fn.count('id').as('count'));
    query = mappingQueryOptions(query, { where }, false);
    const data: any = await query.executeTakeFirst();
    return data?.count;
  }
}
