import {
  CompiledQuery,
  Driver,
  InsertQueryBuilder,
  Kysely,
  RawBuilder,
  SelectQueryBuilder,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely';
import { ZodAny, ZodObject, z } from 'zod';
import { jsonArrayFrom, jsonObjectFrom } from './helpers/sqlite';
import { uid } from './helpers/uid';
import { SqliteSerializePlugin } from './serialize/sqlite-serialize-plugin';
import { defaultSerializer } from './serialize/sqlite-serialize-transformer';
import type {
  ApiOptions,
  BatchResult,
  DataBody,
  DbConfig,
  ExtractResultFromQuery,
  OneActionBody,
  Query,
  QueryRelations,
  QueryWhere,
  TableRelation,
} from './types';

export class SqliteApi<T extends { [key: string]: { id: string } }> {
  readonly ky: Kysely<T>;
  readonly config: DbConfig;
  readonly schema: z.ZodObject<any, any, any, T>;

  constructor({
    config,
    schema,
    driver,
  }: {
    config: DbConfig;
    driver: Driver;
    schema: z.ZodObject<any, any, any, T>;
  }) {
    this.config = config;
    this.schema = schema;
    this.ky = new Kysely<T>({
      dialect: {
        createAdapter: () => new SqliteAdapter(),
        createIntrospector: o => new SqliteIntrospector(o),
        createQueryCompiler: () => new SqliteQueryCompiler(),
        createDriver: () => driver,
      },
      plugins: [
        new SqliteSerializePlugin({
          schema: schema?.shape,
          logger: config.logger,
        }),
      ],
    });
  }

  protected execQuery(body: any, options?: ApiOptions) {
    body.opts = options ?? this.config.options;
    return this.ky.executeQuery(body) as any;
  }

  runSql<T = any>(
    sqlQuery: RawBuilder<T> | { compile: () => CompiledQuery<T> },
    action: 'run' | 'selectAll' | 'selectFirst' = 'run',
    opts?: ApiOptions
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    const query = sqlQuery.compile(this.ky);
    const body: DataBody = {
      action: action,
      sql: query.sql,
      parameters: query.parameters,
    };
    return this.execQuery(body, opts);
  }

  /**
   * only working cloudflare D1 and sqlite
   * use this api to execute one sql query with multiple parameters
   * https://developers.cloudflare.com/d1/platform/client-api/#dbbatch
   * parameters -order- is not automatic like what kysely does
   */
  async batchOneSmt<
    V extends SelectQueryBuilder<T, any, any> | InsertQueryBuilder<T, any, any>
  >(
    sqlQuery: { compile: () => CompiledQuery<T> } | RawBuilder<T>,
    batchParams: Array<any[]>,
    opts?: ApiOptions
  ): Promise<ExtractResultFromQuery<V>[]> {
    return (
      await this.execQuery(this.$batchOneSmt(sqlQuery, batchParams), opts)
    )?.rows;
  }

  $batchOneSmt(
    sqlQuery: { compile: () => CompiledQuery<T> } | RawBuilder<T>,
    batchParams: Array<any[]>
  ): OneActionBody {
    const query =
      sqlQuery instanceof RawBuilder
        ? sqlQuery.compile(this.ky)
        : sqlQuery.compile();
    batchParams.forEach(o => {
      o.forEach((v, index) => {
        o[index] = defaultSerializer(v);
      });
    });
    return {
      action: 'batchOneSmt',
      sql: query.sql,
      parameters: batchParams,
    };
  }

  /*
   * only working cloudflare D1 and sqlite
   * https://developers.cloudflare.com/d1/platform/client-api/#dbbatch
   */
  async batchAllSmt(
    sqlQuerys: Array<{ compile: () => CompiledQuery<T> }>,
    opts?: ApiOptions
  ) {
    const body = {
      action: 'batchAllSmt',
      batch: sqlQuerys.map(o => {
        const v = o.compile();
        const table = (v.query as any).from?.froms[0]?.table.identifier?.name;
        return {
          sql: v.sql,
          parameters: v.parameters,
          action: v.query.kind === 'SelectQueryNode' ? 'selectAll' : 'run',
          table: table,
        };
      }),
    };
    const data: { rows: any[] } = await this.execQuery(body, opts);
    return {
      data: data.rows,
      getOne: <X = any>(index: number): X | undefined => {
        if (Array.isArray(data.rows[index])) {
          return this.parseMany(data.rows[index], body.batch[index].table)?.[0];
        }
        return this.parseOne(data.rows[index], body.batch[index].table);
      },
      getMany: <X = any>(index: number): X[] => {
        return this.parseMany(data.rows[index], body.batch[index].table);
      },
    };
  }

  /*
   * some time you just want to send multiple sql query and get results
   * this will reduce a latency if you send it to across worker.
   */
  async bulk<V extends string>(
    operations: {
      [key in V]:
        | OneActionBody
        | { compile: () => CompiledQuery<T> }
        | RawBuilder<T>
        | undefined;
    },
    opts?: ApiOptions & { isTransaction: boolean }
  ) {
    const ops: Array<OneActionBody & { key: string }> = Object.keys(
      operations
    ).map((k: any) => {
      const value = operations[k as V];
      if (!value) return { key: k };
      if ((value as any).compile) {
        const query: CompiledQuery<T> = (value as any).compile(this.ky);
        const table = (query.query as any).from?.froms[0]?.table.identifier
          ?.name;
        return {
          key: k,
          sql: query.sql,
          table: table,
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
      operations: ops.filter(o => o.action),
    };
    const data: BatchResult = await this.execQuery(body, opts);

    return {
      data: data.rows,
      getOne: <X = any>(key: V, table?: keyof T): X | undefined => {
        const v = data.rows.find(o => o.key === key);
        if (!v) return undefined;
        const name =
          table ?? body.operations.find(o => o.key === key)?.table ?? '';
        if (Array.isArray(v.results)) {
          return this.parseMany(v.results, name as any)?.[0];
        }
        return this.parseOne(v.results, name as any);
      },
      getMany: <X = any>(key: V, table?: string): X[] => {
        const v = data.rows.find(o => o.key === key);
        if (!v) return [];
        const name =
          table ?? body.operations.find(o => o.key === key)?.table ?? '';
        return this.parseMany(v.results, name as any);
      },
    };
  }

  parseOne<X = any>(data: any, table: keyof T): X {
    if (!data || !this.schema.shape[table]) return data;
    return this.schema?.shape[table]?.parse(data) as X;
  }

  parseMany<X = any>(data: any[], table: keyof T): X[] {
    if (!this.schema.shape[table]) return data;
    return data.map(o => this.schema?.shape[table]?.parse(o)) as X[];
  }

  table<K extends keyof T & string>(tableName: K) {
    return new PTable<T[K], T>(
      this.ky,
      tableName,
      this.schema.shape[tableName]
    );
  }
}

function mappingQueryOptions<V>(
  query: any,
  opts: QueryRelations<V>,
  autoSelecAll = true
) {
  if (autoSelecAll) {
    if (opts.select) {
      const columns = Object.keys(opts.select).filter(k => {
        return opts.select?.[k as keyof V];
      });
      query = query.select(columns);
    } else {
      query = query.selectAll();
    }
  }
  if (opts.where) {
    for (const key in opts.where) {
      if (typeof opts.where[key] === 'object') {
        query = query.where(
          key,
          Object.keys(opts.where[key] as any)[0],
          Object.values(opts.where[key] as any)[0]
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
function mappingRelations<V>(
  query: any,
  table: string,
  relations: { [k: string]: TableRelation },
  opts: QueryRelations<V>
) {
  if (opts.include) {
    for (const key in opts.include) {
      const relation = relations[key];
      const select = opts.include[key];
      if (!relation) throw new Error(`relation [${key}] not found`);
      const columns =
        typeof select === 'boolean'
          ? Object.keys(relation.schema?.shape)
          : Object.keys((select as any)?.select);
      if (!columns || columns.length == 0) {
        throw new Error('input schema for table or define a column to select ');
      }
      const fncJson = relation.type == 'one' ? jsonObjectFrom : jsonArrayFrom;
      query = query.select((eb: any) => [
        fncJson(
          eb
            .selectFrom(relation.table)
            .select(columns)
            .whereRef(`${table}.${relation.ref}`, '=', relation.refTarget)
        ).as(key),
      ]);
    }
  }
  return query;
}

/**
 * Api is inspire by Prisma
 */
export class PTable<
  V extends { id: string },
  T extends { [K in keyof T]: { id: string } }
> {
  timeStamp: boolean;
  relations: { [k: string]: TableRelation };
  constructor(
    private readonly ky: Kysely<T>,
    public readonly table: keyof T & string,
    public readonly schema: ZodObject<any, any, any, T>
  ) {
    this.schema = schema;
    this.timeStamp = !!this.schema.shape['updatedAt'];
    this.relations = {};
    for (const [key, value] of Object.entries(this.schema.shape)) {
      if ((value as ZodAny).description) {
        this.relations[key] = ((value as ZodAny)
          .description as unknown) as TableRelation;
      }
    }
  }

  selectById(id: string, select?: Readonly<{ [k in keyof V]?: boolean }>) {
    return this.$selectById(id, select).executeTakeFirst() as Promise<V>;
  }

  $selectById(id: string, select?: Readonly<{ [k in keyof V]?: boolean }>) {
    return this.$selectFirst({
      where: { id } as QueryWhere<V>,
      select,
    });
  }

  selectMany(opts: QueryRelations<V>) {
    return this.$selectMany(opts).execute() as Promise<V[]>;
  }

  $selectMany(opts: QueryRelations<V>) {
    let query = this.ky.selectFrom(this.table);
    query = mappingQueryOptions(query, opts);
    if (this.relations)
      query = mappingRelations(query, this.table, this.relations, opts);
    return query;
  }

  selectFirst(opts: QueryRelations<V>) {
    opts.take = 1;
    return this.$selectMany(opts).executeTakeFirst() as Promise<V | undefined>;
  }

  $selectFirst(opts: QueryRelations<V>) {
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
    if (this.timeStamp) {
      (value as any).updatedAt = new Date();
    }
    return this.ky
      .updateTable(this.table)
      .where('id', '=', id as any)
      .set(value as any);
  }

  updateMany(
    opts: Query<V> & { data: Partial<V> }
  ): Promise<{
    numUpdatedRows: bigint;
    numChangedRows?: bigint;
  }> {
    return this.$updateMany(opts).executeTakeFirst();
  }

  $updateMany(opts: Query<V> & { data: Partial<V> }) {
    let query = this.ky.updateTable(this.table);
    query = mappingQueryOptions(query, opts, false);
    if (this.timeStamp) {
      (opts.data as any).updatedAt = new Date();
    }
    return query.set(opts.data as any);
  }

  async updateOne(
    opts: Query<V> & { data: Partial<V> }
  ): Promise<{
    numUpdatedRows: bigint;
    numChangedRows?: bigint;
  }> {
    return await this.$updateOne(opts).executeTakeFirst();
  }

  $updateOne(opts: Query<V> & { data: Partial<V> }) {
    let query = this.ky.updateTable(this.table);
    if (this.timeStamp) {
      (opts.data as any).updatedAt = new Date();
    }
    let selectQuery = this.ky.selectFrom(this.table);
    opts.take = 1;
    opts.select = { id: true };
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
    if (!value.id) value.id = uid();
    if (this.timeStamp) {
      // @ts-ignore
      if (!value.createdAt) value.createdAt = new Date();
      // @ts-ignore
      if (!value.updatedAt) value.updatedAt = new Date();
    }
    return this.ky.insertInto(this.table).values(value as any);
  }

  /**
   * It use for a non unique key if a key is unique use InsertConflict
   */
  async upsert(opts: {
    data: Partial<V> & { id?: V['id'] };
    where?: QueryWhere<V>;
  }): Promise<Partial<V> & { id: string }> {
    if (opts.data.id) {
      await this.updateOne({
        where: { id: opts.data.id, ...opts.where } as QueryWhere<V>,
        data: opts.data,
      });
      return opts.data as any;
    }
    opts.data.id = uid();
    if (!opts.where) {
      await this.insertOne(opts.data);
      return opts.data as any;
    }

    const check = await this.selectFirst(opts);
    if (!check) {
      return await this.insertOne(opts.data);
    }
    await this.updateOne({ where: opts.where, data: opts.data });
    return opts.data as any;
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
    if (!create.id) create.id = uid();
    return this.ky
      .insertInto(this.table)
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
      if (!o.id) o.id = uid();
      if (this.timeStamp) {
        if (!o.createdAt) o.createdAt = new Date();
        if (!o.updatedAt) o.updatedAt = new Date();
      }
    });
    return this.ky.insertInto(this.table).values(values as any);
  }

  async deleteById(id: string): Promise<{ numDeletedRows: BigInt }> {
    return await this.$deleteById(id).executeTakeFirst();
  }

  $deleteById(id: string) {
    return this.ky.deleteFrom(this.table).where('id', '=', id as any);
  }

  async deleteMany(opts: {
    where?: QueryWhere<V>;
  }): Promise<{ numDeletedRows: BigInt }> {
    return await this.$deleteMany(opts).executeTakeFirst();
  }

  $deleteMany({ where }: { where?: QueryWhere<V> }) {
    let query = this.ky.deleteFrom(this.table);
    query = mappingQueryOptions(query, { where }, false);
    return query;
  }

  async count({ where }: { where: QueryWhere<V> }): Promise<number> {
    let query = this.ky.selectFrom(this.table);
    query = query.select(eb => eb.fn.count('id').as('count'));
    query = mappingQueryOptions(query, { where }, false);
    const data: any = await query.executeTakeFirst();
    return data?.count;
  }
}
