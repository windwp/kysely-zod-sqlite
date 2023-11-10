import { ZodObject, ZodTypeAny, z } from 'zod';
import { PApi, PTable } from './papi';
import type {
  ApiOptions,
  BatchResult,
  DataBody,
  ExtractResultFromQuery,
  OneActionBody,
  ZodSchemaToKysely,
} from '../types';
import type {
  CompiledQuery,
  InsertQueryBuilder,
  Kysely,
  RawBuilder,
  SelectQueryBuilder,
} from 'kysely';
import { defaultSerializer } from '../serialize/sqlite-serialize-transformer';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/sqlite';

export class SqliteApi<
  Schema extends ZodObject<any, any, any>
> extends PApi<Schema> {

  table<K extends keyof z.output<Schema> & string>(
    tableName: K,
    opts?: {
      ky?: Kysely<ZodSchemaToKysely<Schema>>;
      timeStamp?: boolean;
      autoId?: boolean;
      autoIdFnc?: (tableName?: string) => string;
    }
  ) {
    const ky = opts?.ky || this.ky;
    return new PTable<z.output<Schema>[K], z.input<Schema>[K], K>(
      ky as z.output<Schema>[K],
      tableName,
      { jsonArrayFrom, jsonObjectFrom },
      this.schema.shape[tableName],
      this.config.autoIdFnc
        ? { ...opts, autoIdFnc: this.config.autoIdFnc }
        : opts
    );
  }
  //@ts-nocheck
  /**
   * only working cloudflare D1 and sqlite
   * use this api to execute one sql query with multiple parameters
   * https://developers.cloudflare.com/d1/platform/client-api/#dbbatch
   * @param batchParams  order of params is not automatic like what kysely does
   */
  async batchOneSmt<
    V extends
      | SelectQueryBuilder<z.output<Schema>, any, any>
      | InsertQueryBuilder<z.output<Schema>, any, any>
  >(
    sqlQuery:
      | { compile: () => CompiledQuery<z.output<Schema>> }
      | RawBuilder<z.output<Schema>>,
    batchParams: Array<any[]>,
    opts?: ApiOptions
  ): Promise<{ rows: ExtractResultFromQuery<V>[]; error: any }> {
    return await this.execQuery(
      this.$batchOneSmt(sqlQuery, batchParams),
      opts
    ).catch((e: any) => ({ rows: [], error: e }));
  }

  $batchOneSmt(
    sqlQuery:
      | { compile: () => CompiledQuery<z.output<Schema>> }
      | RawBuilder<z.output<Schema>>,
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
   * run transaction
   * https://developers.cloudflare.com/d1/platform/client-api/#dbbatch
   */
  async batchAllSmt(
    sqlQuerys: Array<{ compile: () => CompiledQuery<z.output<Schema>> }>,
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
        | { compile: () => CompiledQuery<z.output<Schema>> }
        | RawBuilder<z.output<Schema>>
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
        const query: CompiledQuery<z.output<Schema>> = (value as any).compile(
          this.ky
        );
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
      (e: any) => ({ rows: [], error: e })
    );

    return {
      data: data.rows,
      error: data.error,
      getOne: <X = any>(
        key: V,
        table?: keyof z.output<Schema>,
        extend?: ZodObject<any, any>
      ): X | undefined => {
        const v = data.rows.find(o => o.key === key);
        if (!v) return undefined;
        const name =
          table ??
          (body.operations.find(o => o.key === key)
            ?.table as keyof z.output<Schema>);
        if (!name) return undefined;
        if (Array.isArray(v.results)) {
          return this.parseMany(v.results, name, extend)?.[0];
        }
        return this.parseOne(v.results, name, extend);
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
  withTables<
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
  >(schema: T, extendApi?: ExtendApi) {
    const api = new SqliteApi({
      config: this.config,
      schema: this.schema.extend(schema) as ExtendSchema,
      kysely: this.ky as Kysely<ZodSchemaToKysely<ExtendSchema>>,
    });

    if (extendApi) {
      for (const key in extendApi) {
        (api as any)[key] = extendApi[key](api as any);
      }
    }
    return api as unknown as PApi<ExtendSchema> & {
      [key in keyof ExtendApi]: ReturnType<ExtendApi[key]>;
    };
  }
}
