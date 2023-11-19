import type {
  CompiledQuery,
  InsertQueryBuilder,
  Kysely,
  RawBuilder,
  SelectQueryBuilder,
  UpdateObject,
} from 'kysely';
import type { ZodAny, ZodObject, ZodType, ZodTypeAny } from 'zod';
import { z } from 'zod';

import type {
  ApiConfig,
  ApiOptions,
  DataBody,
  ExtractResultFromQuery,
  PActionBody,
  PHooks,
  Query,
  QueryRelations,
  QueryWhere,
  TableRelation,
  ZodSchemaToKysely,
} from '../types';
import type { SetOptional } from 'type-fest';
import { mappingQueryOptions, mappingRelations } from '../helpers/mapping.js';

export abstract class PApi<Schema extends ZodObject<any, any, any>> {
  public ky!: Kysely<ZodSchemaToKysely<Schema>>;
  readonly config: ApiConfig;
  readonly schema: Schema;

  constructor(obj: {
    config?: ApiConfig;
    kysely: Kysely<ZodSchemaToKysely<Schema>>;
    schema: Schema;
    jsonHelpers?: {
      jsonArrayFrom: (query: any) => any;
      jsonObjectFrom: (query: any) => any;
    };
  }) {
    this.config = obj.config ?? {};
    this.schema = obj.schema;
    this.ky = obj.kysely;
    this.config.dialect ??= 'sqlite';
    this.config.paramPlaceholder =
      this.config.dialect == 'postgres' ? '$' : '?';
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

  parseOne<X = any>(
    data: any,
    table: keyof z.output<Schema>,
    extend?: ZodObject<any, any, any>
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
    table: keyof z.output<Schema>,
    extend?: ZodObject<any, any>
  ): X[] {
    let shape = this.schema?.shape[table]?.partial();
    if (!shape) return data;
    if (extend) {
      shape = shape.extend(extend).shape as any;
    }
    return data.map(o => shape.parse(o)) as X[];
  }

  param(index: number): string {
    return this.config.dialect != 'sqlite'
      ? this.config.paramPlaceholder! + index
      : this.config.paramPlaceholder!;
  }

  abstract table<K extends keyof z.output<Schema> & string>(
    tableName: K,
    opts?: {
      ky?: Kysely<ZodSchemaToKysely<Schema>>;
      timeStamp?: boolean;
      autoId?: boolean;
      autoIdFnc?: (tableName?: string) => string;
    }
  ): PTable<z.output<Schema>[K], z.input<Schema>[K], K>;

  abstract batchOneSmt<
    V extends
      | SelectQueryBuilder<z.output<Schema>, any, any>
      | InsertQueryBuilder<z.output<Schema>, any, any>
  >(
    sqlQuery:
      | { compile: () => CompiledQuery<z.output<Schema>> }
      | RawBuilder<z.output<Schema>>,
    batchParams: Array<any[]>,
    opts?: ApiOptions
  ): Promise<{ rows: ExtractResultFromQuery<V>[]; error: any }>;

  abstract $batchOneSmt(
    sqlQuery:
      | { compile: () => CompiledQuery<z.output<Schema>> }
      | RawBuilder<z.output<Schema>>,
    batchParams: Array<any[]>
  ): PActionBody;

  /*
   * only working cloudflare D1 and sqlite
   * https://developers.cloudflare.com/d1/platform/client-api/#dbbatch
   */
  abstract batchAllSmt(
    sqlQuerys: Array<{ compile: () => CompiledQuery<z.output<Schema>> }>,
    opts?: ApiOptions
  ): Promise<{
    error: any;
    rows: any[];
    getOne: <X = any>(index: number) => X | undefined;
    getMany: <X = any>(index: number) => X[];
  }>;

  /*
   * some time you just want to send multiple sql query and get results
   * this will reduce a latency if you send it to across worker.
   */
  abstract bulk<V extends string>(
    operations: {
      [key in V]:
        | PActionBody
        | { compile: () => CompiledQuery<z.output<Schema>> }
        | RawBuilder<z.output<Schema>>
        | undefined;
    },
    opts?: ApiOptions & { isTransaction: boolean }
  ): Promise<{}>;
  /**
   * extend the origin zod schema
   * it similar to withTables on kysely
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
  abstract withTables<
    T extends { [k: string]: ZodTypeAny },
    ExtendApi extends {
      [key: string]: (api: PApi<ExtendSchema>) => PTable<any, any, any>;
    },
    ExtendSchema extends ZodObject<
      z.input<Schema> & T,
      any,
      any,
      z.input<Schema> & { [k in keyof T]: z.input<T[k]> },
      z.output<Schema> & { [k in keyof T]: z.output<T[k]> }
    >
  >(
    schema: T,
    extendApi?: ExtendApi
  ): PApi<ExtendSchema> & {
    [key in keyof ExtendApi]: ReturnType<ExtendApi[key]>;
  };
}

/**
 * Some shorcut query
 */
export class PTable<
  Table extends { id: string | number },
  TableInput extends { id: string | number },
  TableName extends string
> {
  private relations: { [k: string]: TableRelation };
  private hooks: PHooks[];
  private hookContext: { schema: any; table: string };
  constructor(
    public readonly ky: Kysely<{ [k in TableName]: Table }>,
    private readonly table: TableName,
    private readonly jsonHelpers: {
      jsonArrayFrom: (query: any) => any;
      jsonObjectFrom: (query: any) => any;
    },
    private readonly schema?: ZodObject<{
      [k in keyof Table]: ZodType<Table[k]>;
    }>,
    opts?: {
      hooks: PHooks[];
    }
  ) {
    this.schema = schema;
    this.hooks = opts?.hooks ?? [];
    this.hookContext = { schema: this.schema, table: this.table };
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

  selectMany(opts: QueryRelations<TableInput>) {
    return this.$selectMany(opts).execute() as Promise<Table[]>;
  }

  $selectMany(opts: QueryRelations<TableInput>) {
    return this.mappingQuery(this.ky.selectFrom(this.table), opts);
  }

  selectFirst(opts: QueryRelations<TableInput>) {
    opts.take = 1;
    return this.$selectMany(opts).executeTakeFirst() as Promise<
      Table | undefined
    >;
  }

  $selectFirst(opts: QueryRelations<TableInput>) {
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
    const data: any = opts.data;
    let query = this.ky.updateTable(this.table);
    query = mappingQueryOptions(query, opts, false);
    this.hooks.forEach(h => {
      if (h.onUpdate) h.onUpdate(data, this.hookContext);
    });
    const schema = this.schema?.extend({ id: z.any() }).partial();
    return query.set(schema?.parse(data) ?? data);
  }

  async updateOne(
    opts: Query<Table> & {
      data: UpdateObject<{ [k in TableName]: Table }, TableName>;
    }
  ): Promise<{
    numUpdatedRows: bigint;
    numChangedRows?: bigint;
  }> {
    return await this.$updateOne(opts).executeTakeFirst();
  }

  $updateOne(
    opts: Query<Table> & {
      data: UpdateObject<{ [k in TableName]: Table }, TableName>;
    }
  ) {
    const data: any = opts.data;
    this.hooks.forEach(h => {
      if (h.onUpdate) h.onUpdate(data, this.hookContext);
    });
    let query = this.ky.updateTable(this.table);
    let selectQuery = this.ky.selectFrom(this.table);
    opts.take = 1;
    opts.select = { id: true };
    selectQuery = mappingQueryOptions(selectQuery, opts);
    query = query.where('id', 'in', selectQuery);
    delete data.id;
    return query.set(data);
  }

  async insertOne(
    value: SetOptional<TableInput, 'id'>
  ): Promise<Table | undefined> {
    const check: any = await this.$insertOne(value).execute();
    if (value.id) {
      return value as unknown as Table;
    } else if (check?.changes == BigInt(1)) {
      if (check.lastInsertRowid && this.schema?.shape['id']) {
        value.id = Number(check.lastInsertRowid);
      }
    } else if (Array.isArray(check)) {
      value.id = check[0].id;
    }
    return value as unknown as Table;
  }

  $insertOne(value: SetOptional<TableInput, 'id'>) {
    const v = value as any;
    this.hooks.forEach(h => {
      if (h.onInsert) h.onInsert(v, this.hookContext);
    });
    const validValue = this.schema
      ?.extend({ id: z.any() })
      .strict()
      .parse(v) as unknown as any;
    return !v.id && this.schema?.shape['id']
      ? this.ky
          .insertInto(this.table)
          .values(validValue as any)
          .returning('id')
      : this.ky.insertInto(this.table).values(validValue);
  }

  /**
   * It use for a non unique key if a key is unique use InsertConflict
   */
  async upsert(opts: {
    data: Partial<TableInput>;
    where?: QueryWhere<Table>;
  }): Promise<Partial<Table> | undefined> {
    const data: any = opts.data;
    if (data.id) {
      await this.updateOne({
        where: { id: opts.data.id, ...opts.where } as QueryWhere<Table>,
        data,
      });
      return data;
    }

    this.hooks.forEach(h => {
      if (h.onInsert) h.onInsert(data, this.hookContext);
    });

    if (!opts.where) {
      return await this.insertOne(data);
    }

    const check = await this.selectFirst(opts as QueryRelations<TableInput>);
    if (!check) {
      return await this.insertOne(data);
    }
    await this.updateOne({ where: opts.where, data });
    return data;
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
    this.hooks.forEach(h => {
      if (h.onInsert) h.onInsert(create, this.hookContext);
      if (h.onUpdate) h.onUpdate(update, this.hookContext);
    });
    return this.ky
      .insertInto(this.table)
      .values(create as any)
      .onConflict(oc =>
        oc.columns(conflicts as any).doUpdateSet(update as any)
      );
  }

  async insertMany(values: Array<Partial<Table>>): Promise<Table[]> {
    if (values.length == 0) return [];
    const result: any = await this.$insertMany(values).execute();
    const autoId = (this.schema as any).shape.id?._def.typeName === 'ZodString';
    if (autoId) return values as any;
    if (Array.isArray(result)) {
      result.forEach((o: any, index) => {
        values[index].id = o.id;
      });
      return values as Table[];
    } else if (result?.changes == BigInt(values.length)) {
      if (!autoId) {
        // not sure about this
        values.forEach((o, index) => {
          o.id = Number(result.lastInsertRowid) - values.length + index + 1;
        });
      }
      return values as Table[];
    }
    return values as Table[];
  }

  $insertMany(values: Array<Partial<Table>>) {
    const schema = this.schema?.extend({ id: z.any() });
    const validValues: any = values.map((v: any) => {
      this.hooks.forEach(h => {
        if (h.onInsert) h.onInsert(v, this.hookContext);
      });
      return schema?.parse(v) ?? v;
    });

    return validValues.id
      ? this.ky.insertInto(this.table).values(validValues)
      : this.ky
          .insertInto(this.table)
          .values(validValues as any)
          .returning('id');
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
    query = query.select(eb => eb.fn.countAll<number>().as('count'));
    query = mappingQueryOptions(query, { where }, false);
    const data: any = await query.executeTakeFirst();
    return parseInt(data?.count);
  }

  selectById(
    id: Table['id'],
    select?: Readonly<{ [k in keyof TableInput]?: boolean }>
  ) {
    return this.$selectById(id, select).executeTakeFirst() as Promise<
      Table | undefined
    >;
  }

  $selectById(
    id: Table['id'],
    select?: Readonly<{ [k in keyof TableInput]?: boolean }>
  ) {
    const query = this.ky.selectFrom(this.table).where('id', '=', id as any);
    return mappingQueryOptions(query, { select });
  }

  private mappingQuery(query: any, opts: QueryRelations<TableInput>) {
    query = mappingQueryOptions(query, opts);
    return mappingRelations(
      query,
      this.table,
      this.relations,
      opts,
      this.jsonHelpers
    );
  }

  updateById(
    id: Table['id'],
    value: Partial<Table>
  ): Promise<{
    numUpdatedRows: bigint;
    numChangedRows?: bigint;
  }> {
    if (value.id) delete value.id;
    return this.$updateById(id, value).executeTakeFirst();
  }

  $updateById(id: Table['id'], value: Partial<Table>) {
    this.hooks.forEach(h => {
      if (h.onUpdate) h.onUpdate(value, this.hookContext);
    });
    return this.ky
      .updateTable(this.table)
      .where('id', '=', id as any)
      .set(value as any);
  }

  deleteById(id: Table['id']): Promise<{ numDeletedRows: BigInt }> {
    return this.$deleteById(id).executeTakeFirst();
  }

  $deleteById(id: Table['id']) {
    return this.ky.deleteFrom(this.table).where('id', '=', id as any);
  }
}

export type InferSchemaFromPApi<T> = T extends PApi<infer K>
  ? K extends Record<string, any>
    ? K
    : never
  : never;
export type PTableFromSchema<
  Schema extends ZodObject<any, any, any>,
  K extends keyof z.output<Schema> & string
> = PTable<z.output<Schema>[K], z.input<Schema>[K], K>;
