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
import { TypeOf, ZodAny, ZodObject, ZodType, z } from 'zod';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/sqlite';
import { uid } from './helpers/uid';
import { SqliteSerializePlugin } from './serialize/sqlite-serialize-plugin';
import { defaultSerializer } from './serialize/sqlite-serialize-transformer';
import type {
  ApiOptions,
  BatchResult,
  DataBody,
  DbConfig,
  ExtractResultFromQuery,
  FetchConfig,
  OneActionBody,
  Query,
  QueryRelations,
  QueryWhere,
  TableRelation,
} from './types';
import type { SetOptional } from 'type-fest';

export class SqliteApi<Database extends Record<string, any>> {
  readonly ky: Kysely<Database>;
  readonly config: DbConfig | FetchConfig;
  readonly schema: z.ZodObject<any, any, any>;
  readonly driver: Driver;

  constructor({
    config,
    schema,
    driver,
  }: {
    config: DbConfig;
    driver: Driver;
    schema: z.ZodObject<any, any, any>;
  }) {
    this.config = config;
    this.schema = schema;
    this.driver = driver;
    this.ky = this.initKysely(this.driver);
  }

  private initKysely(driver: Driver) {
    return new Kysely<Database>({
      dialect: {
        createAdapter: () => new SqliteAdapter(),
        createIntrospector: o => new SqliteIntrospector(o),
        createQueryCompiler: () => new SqliteQueryCompiler(),
        createDriver: () => driver,
      },
      plugins: [
        new SqliteSerializePlugin({
          schema: this.schema?.shape,
          logger: this.config.logger,
        }),
      ],
    });
  }

  protected execQuery(body: any, options?: ApiOptions) {
    body.opts = options ?? this.config.options;
    return this.ky.executeQuery(body) as any;
  }

  execSql<T = any>(
    sqlQuery: RawBuilder<T> | { compile: () => CompiledQuery<T> },
    action: 'run' | 'selectAll' | 'selectFirst' = 'run',
    opts?: ApiOptions
  ): Promise<{ changes: number; lastInsertRowId: number; rows: T[] }> {
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
   * @param batchParams  order of params is not automatic like what kysely does
   */
  async batchOneSmt<
    V extends
      | SelectQueryBuilder<Database, any, any>
      | InsertQueryBuilder<Database, any, any>
  >(
    sqlQuery: { compile: () => CompiledQuery<Database> } | RawBuilder<Database>,
    batchParams: Array<any[]>,
    opts?: ApiOptions
  ): Promise<{ rows: ExtractResultFromQuery<V>[]; error: any }> {
    return await this.execQuery(
      this.$batchOneSmt(sqlQuery, batchParams),
      opts
    ).catch((e: any) => ({ rows: [], error: e }));
  }

  $batchOneSmt(
    sqlQuery: { compile: () => CompiledQuery<Database> } | RawBuilder<Database>,
    batchParams: Array<any[]>
  ): OneActionBody {
    const query = sqlQuery.compile(this.ky);
    batchParams.forEach(o => {
      if (Array.isArray(o)) {
        o.forEach((v, index) => {
          o[index] = defaultSerializer(v);
        });
      }
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
    sqlQuerys: Array<{ compile: () => CompiledQuery<Database> }>,
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
    const data: { rows: any[]; error?: any } = await this.execQuery(
      body,
      opts
    ).catch((e: any) => ({ rows: [], error: e }));
    return {
      error: data.error,
      rows: data.rows,
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
        | { compile: () => CompiledQuery<Database> }
        | RawBuilder<Database>
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
        const query: CompiledQuery<Database> = (value as any).compile(this.ky);
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
    const data: BatchResult = await this.execQuery(body, opts).catch(
      (e: any) => ({
        rows: [],
        error: e,
      })
    );

    return {
      data: data.rows,
      error: data.error,
      getOne: <X = any>(
        key: V,
        table?: keyof Database,
        extend?: ZodObject<any, any>
      ): X | undefined => {
        const v = data.rows.find(o => o.key === key);
        if (!v) return undefined;
        const name =
          table ?? body.operations.find(o => o.key === key)?.table ?? '';
        if (Array.isArray(v.results)) {
          return this.parseMany(v.results, name as any, extend)?.[0];
        }
        return this.parseOne(v.results, name as any, extend);
      },
      getMany: <X = any>(
        key: V,
        table?: string,
        extend?: ZodObject<any, any>
      ): X[] => {
        const v = data.rows.find(o => o.key === key);
        if (!v) return [];
        const name =
          table ?? body.operations.find(o => o.key === key)?.table ?? '';
        return this.parseMany(v.results, name as any, extend);
      },
    };
  }

  parseOne<X = any>(
    data: any,
    table: keyof Database,
    extend?: ZodObject<any, any>
  ): X {
    let shape = this.schema?.shape[table]?.partial();
    if (!shape || !data) return data;
    if (extend) {
      shape = shape.extend(extend);
    }
    return this.schema.shape[table]?.partial().parse(data) as X;
  }

  parseMany<X = any>(
    data: any[],
    table: keyof Database,
    extend?: ZodObject<any, any>
  ): X[] {
    let shape = this.schema?.shape[table]?.partial();
    if (!shape) return data;
    if (extend) {
      shape = shape.extend(extend).shape;
    }
    return data.map(o => shape.parse(o)) as X[];
  }

  table<K extends keyof Database & string>(
    tableName: K,
    opts?: {
      timeStamp?: boolean;
      autoId?: boolean;
      driver?: Driver;
      autoIdFnc?: (tableName?: string) => string;
    }
  ) {
    const ky = opts?.driver ? this.initKysely(opts?.driver) : this.ky;
    return new PTable<Database[K], K>(
      ky as Database[K],
      tableName,
      this.schema.shape[tableName],
      opts
    );
  }

  /**
   * extend the origin zod schema
   * it similar to withTables onkysely
   *
   * ```typescript
   * const extendApi = api.withTables(
   *   {
   *     NewTable: z.object({
   *       id: z.number().optional(),
   *       name: z.string(),
   *     }),
   *   },
   *   { // option
   *     newTable: o => o.table('NewTable'),
   *   })
   * ```
   **/
  withTables<
    T extends Record<string, ZodObject<any, any, any>>,
    ExtendApi extends {
      [key: string]: (
        api: SqliteApi<Database & { [key in keyof T]: TypeOf<T[key]> }>
      ) => PTable<any, any>;
    }
  >(schema: T, extendApi?: ExtendApi) {
    const api = new SqliteApi({
      config: this.config,
      schema: this.schema.extend(schema),
      driver: this.driver,
    }) as unknown as SqliteApi<Database & { [key in keyof T]: TypeOf<T[key]> }>;

    if (extendApi) {
      for (const key in extendApi) {
        (api as any)[key] = extendApi[key](api);
      }
    }
    return api as SqliteApi<Database & { [key in keyof T]: TypeOf<T[key]> }> & {
      [key in keyof ExtendApi]: ReturnType<ExtendApi[key]>;
    };
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
      } else {
        if (opts.where[key] === undefined || opts.where[key] === null) {
          const cl: any = structuredClone(opts.where);
          cl[key] = '<------ Error';
          throw new Error(
            `select value of '${key}' is null ${JSON.stringify(cl, null, 2)}`
          );
        }
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
        throw new Error(
          'you need input schema for table or define a column to select '
        );
      }
      const fncJson: any =
        relation.type == 'one' ? jsonObjectFrom : jsonArrayFrom;
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
 * Some shorcut query
 */
export class PTable<
  Table extends { id: string | number },
  TableName extends string
> {
  private timeStamp: boolean;
  private autoId: boolean;
  private autoIdFnc: (tableName: string, value: any) => string;
  private relations: { [k: string]: TableRelation };
  constructor(
    public readonly ky: Kysely<{ [k in TableName]: Table }>,
    private readonly table: TableName,
    public readonly schema: ZodObject<{
      [k in keyof Table]: ZodType<Table[k]>;
    }>,
    opts?: {
      timeStamp?: boolean;
      autoId?: boolean;
      autoIdFnc?: (tableName: string, value: Table) => string;
    }
  ) {
    this.schema = schema;
    this.timeStamp =
      opts?.timeStamp ?? !!(this.schema?.shape as any)['updatedAt'];
    this.autoId =
      opts?.autoId ??
      (this.schema?.shape['id']?._def as any)?.typeName === 'ZodString';
    this.autoIdFnc =
      opts?.autoIdFnc ||
      function () {
        return uid();
      };

    this.relations = {};
    if (this.schema?.shape) {
      for (const [key, value] of Object.entries(this.schema.shape)) {
        if ((value as ZodAny).description) {
          this.relations[key] = (value as ZodAny)
            .description as unknown as TableRelation;
        }
      }
    }
  }

  selectMany(opts: QueryRelations<Table>) {
    return this.$selectMany(opts).execute() as Promise<Table[]>;
  }

  $selectMany(opts: QueryRelations<Table>) {
    let query = this.ky.selectFrom(this.table);
    query = mappingQueryOptions(query, opts);
    if (this.relations) {
      query = mappingRelations(query, this.table, this.relations, opts);
    }
    return query;
  }

  selectFirst(opts: QueryRelations<Table>) {
    opts.take = 1;
    return this.$selectMany(opts).executeTakeFirst() as Promise<
      Table | undefined
    >;
  }

  $selectFirst(opts: QueryRelations<Table>) {
    opts.take = 1;
    return this.$selectMany(opts);
  }

  updateMany(opts: Query<Table> & { data: Partial<Table> }): Promise<{
    numUpdatedRows: bigint;
    numChangedRows?: bigint;
  }> {
    return this.$updateMany(opts).executeTakeFirst();
  }

  $updateMany(opts: Query<Table> & { data: Partial<Table> }) {
    let query = this.ky.updateTable(this.table);
    query = mappingQueryOptions(query, opts, false);
    if (this.timeStamp) {
      (opts.data as any).updatedAt = new Date();
    }
    const schema = this.schema.extend({ id: z.any() }).partial();
    return query.set(schema.parse(opts.data) as any);
  }

  async updateOne(opts: Query<Table> & { data: Partial<Table> }): Promise<{
    numUpdatedRows: bigint;
    numChangedRows?: bigint;
  }> {
    return await this.$updateOne(opts).executeTakeFirst();
  }

  $updateOne(opts: Query<Table> & { data: Partial<Table> }) {
    let query = this.ky.updateTable(this.table);
    if (this.timeStamp) {
      (opts.data as any).updatedAt = new Date();
    }
    let selectQuery = this.ky.selectFrom(this.table);
    opts.take = 1;
    opts.select = { id: true };
    selectQuery = mappingQueryOptions(selectQuery, opts);
    query = query.where('id', 'in', selectQuery);
    delete opts.data.id;
    return query.set(opts.data as any);
  }

  async insertOne(value: SetOptional<Table, 'id'>): Promise<Table | undefined> {
    const check = await this.$insertOne(value).executeTakeFirst();
    if (check?.numInsertedOrUpdatedRows == BigInt(1)) {
      if (!this.autoId && check.insertId && this.schema?.shape['id']) {
        value.id = Number(check.insertId);
      }
      return value as Table;
    }
    return undefined;
  }

  $insertOne(value: SetOptional<Table, 'id'>) {
    if (!value.id && this.autoId)
      value.id = this.autoIdFnc(this.table, value as Table);
    const v = value as any;
    if (this.timeStamp) {
      if (!v.createdAt) v.createdAt = new Date();
      if (!v.updatedAt) v.updatedAt = new Date();
    }
    const validValue = this.schema
      .extend({ id: z.any() })
      .strict()
      .parse(v) as unknown as Table;
    return this.ky.insertInto(this.table).values(validValue as any);
  }

  /**
   * It use for a non unique key if a key is unique use InsertConflict
   */
  async upsert(opts: {
    data: Partial<Table>;
    where?: QueryWhere<Table>;
  }): Promise<Partial<Table> | undefined> {
    if (opts.data.id) {
      await this.updateOne({
        where: { id: opts.data.id, ...opts.where } as QueryWhere<Table>,
        data: opts.data,
      });
      return opts.data;
    }
    opts.data.id = this.autoIdFnc(this.table, opts.data);
    if (!opts.where) {
      await this.insertOne(opts.data as Table);
      return opts.data;
    }

    const check = await this.selectFirst(opts);
    if (!check) {
      return await this.insertOne(opts.data as Table);
    }
    await this.updateOne({ where: opts.where, data: opts.data });
    return opts.data as any;
  }

  /** conflicts columns should be a unique or primary key */
  async insertConflict(opts: {
    create: Partial<Table>;
    update: Partial<Table>;
    conflicts: Array<keyof Table & string>;
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
    create: Partial<Table>;
    update: Partial<Table>;
    conflicts: Array<keyof Table & string>;
  }) {
    if (!create.id && this.autoId)
      create.id = this.autoIdFnc(this.table, create);
    return this.ky
      .insertInto(this.table)
      .values(create as any)
      .onConflict(oc =>
        oc.columns(conflicts as any).doUpdateSet(update as any)
      );
  }

  async insertMany(
    values: Array<Partial<Table>>
  ): Promise<Table[] | undefined> {
    if (values.length == 0) return [];
    const check = await this.$insertMany(values).executeTakeFirst();
    if (check?.numInsertedOrUpdatedRows == BigInt(values.length)) {
      if (!this.autoId) {
        // not sure about this
        values.forEach((o, index) => {
          o.id = Number(check.insertId) - values.length + index + 1;
        });
      }
      return values as Table[];
    }
    return undefined;
  }

  $insertMany(values: Array<Partial<Table>>) {
    const schema = this.schema?.extend({ id: z.any() });
    const validValues = values.map((o: any) => {
      if (!o.id && this.autoId) o.id = this.autoIdFnc(this.table, o);
      if (this.timeStamp) {
        if (!o.createdAt) o.createdAt = new Date();
        if (!o.updatedAt) o.updatedAt = new Date();
      }
      return schema.parse(o);
    });
    return this.ky.insertInto(this.table).values(validValues as any);
  }

  async deleteMany(opts: {
    where?: QueryWhere<Table>;
  }): Promise<{ numDeletedRows: BigInt }> {
    return await this.$deleteMany(opts).executeTakeFirst();
  }

  $deleteMany({ where }: { where?: QueryWhere<Table> }) {
    let query = this.ky.deleteFrom(this.table);
    query = mappingQueryOptions(query, { where }, false);
    return query;
  }

  async count({ where }: { where?: QueryWhere<Table> }): Promise<number> {
    let query = this.ky.selectFrom(this.table);
    query = query.select(eb => eb.fn.countAll().as('count'));
    query = mappingQueryOptions(query, { where }, false);
    const data: any = await query.executeTakeFirst();
    return data?.count;
  }

  selectById(
    id: Table['id'],
    select?: Readonly<{ [k in keyof Table]?: boolean }>
  ) {
    return this.$selectById(id, select).executeTakeFirst() as Promise<
      Table | undefined
    >;
  }

  $selectById(
    id: Table['id'],
    select?: Readonly<{ [k in keyof Table]?: boolean }>
  ) {
    return this.$selectFirst({
      where: { id } as QueryWhere<Table>,
      select,
    });
  }

  async updateById(
    id: Table['id'],
    value: Partial<Table>
  ): Promise<{
    numUpdatedRows: bigint;
    numChangedRows?: bigint;
  }> {
    if (value.id) delete value.id;
    return await this.$updateById(id, value).executeTakeFirst();
  }

  $updateById(id: Table['id'], value: Partial<Table>) {
    if (this.timeStamp) {
      (value as any).updatedAt = new Date();
    }
    return this.ky
      .updateTable(this.table)
      .where('id', '=', id as any)
      .set(value as any);
  }

  async deleteById(id: Table['id']): Promise<{ numDeletedRows: BigInt }> {
    return await this.$deleteById(id).executeTakeFirst();
  }

  $deleteById(id: Table['id']) {
    return this.ky.deleteFrom(this.table).where('id', '=', id as any);
  }
}

export type InferFromSqlApi<T> = T extends SqliteApi<infer K>
  ? K extends Record<string, any>
    ? K
    : never
  : never;
