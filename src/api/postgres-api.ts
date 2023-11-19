import { ZodObject, ZodTypeAny, z } from 'zod';
import { PApi, PTable } from './papi';
import type {
  ApiOptions,
  DataBody,
  ExtractResultFromQuery,
  PActionBody,
  PHooks,
  ZodSchemaToKysely,
} from '../types';
import type {
  CompiledQuery,
  InsertQueryBuilder,
  Kysely,
  RawBuilder,
  SelectQueryBuilder,
} from 'kysely';
import { defaultSerializer } from '../serialize/sqlite-serialize-transformer.js';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import { hookAutoId } from '../hooks/auto-id';
import { hookTimeStamp } from '../hooks/timestamp';

export class PostgresApi<
  Schema extends ZodObject<any, any, any>
> extends PApi<Schema> {
  table<K extends keyof z.output<Schema> & string>(
    tableName: K,
    opts?: {
      ky?: Kysely<ZodSchemaToKysely<Schema>>;
      hooks?: PHooks[];
    }
  ) {
    const ky = opts?.ky || this.ky;
    const hooks = opts?.hooks ||
      this.config.hooks || [
        hookAutoId(this.config.autoIdFnc),
        hookTimeStamp({ updatedAt: 'updatedAt', createdAt: 'createdAt' }),
      ];
    return new PTable<z.output<Schema>[K], z.input<Schema>[K], K>(
      ky as z.output<Schema>[K],
      tableName,
      { jsonArrayFrom, jsonObjectFrom },
      this.schema.shape[tableName],
      { hooks }
    );
  }

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
    const body = this.$batchOneSmt(sqlQuery, batchParams);
    if (body.action === 'batchAllSmt') {
      try {
        const data = await this.ky.transaction().execute(async trx => {
          const result = [];
          for (const o of body.batch) {
            const v = await trx.executeQuery(o as unknown as CompiledQuery);
            result.push(v);
          }
          return result;
        });
        return { rows: data.map(o => o.rows) as any, error: undefined };
      } catch (error) {
        return { rows: [], error: error };
      }
    }
    return { rows: [], error: 'not support' };
  }

  $batchOneSmt(
    sqlQuery:
      | { compile: () => CompiledQuery<z.output<Schema>> }
      | RawBuilder<z.output<Schema>>,
    batchParams: Array<any[]>
  ): PActionBody {
    const query = sqlQuery.compile(this.ky);
    batchParams.forEach(o => {
      if (Array.isArray(o)) {
        o.forEach((v, index) => {
          o[index] = defaultSerializer(v);
        });
      }
    });
    const table = (query.query as any).from?.froms[0]?.table.identifier?.name;
    return {
      action: 'batchAllSmt' as const,
      batch: batchParams.map(o => {
        return {
          sql: query.sql,
          parameters: o,
          table: table,
          action: 'run',
        };
      }),
    };
  }

  async batchAllSmt(
    sqlQuerys: Array<{ compile: () => CompiledQuery<z.output<Schema>> }>,
    _?: ApiOptions
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
    const data = await this.ky.transaction().execute(async trx => {
      const result = [];
      for (const o of body.batch) {
        const v = await trx.executeQuery(o as unknown as CompiledQuery);
        result.push(v);
      }
      return result;
    });

    return {
      error: undefined,
      rows: data,
      getOne: <X = any>(index: number): X | undefined => {
        if (Array.isArray(data[index]?.rows)) {
          return this.parseMany(
            data[index]?.rows,
            body.batch[index].table
          )?.[0];
        }
        return this.parseOne(data[index]?.rows, body.batch[index].table);
      },
      getMany: <X = any>(index: number): X[] => {
        return this.parseMany(data[index]?.rows, body.batch[index].table);
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
        | PActionBody
        | { compile: () => CompiledQuery<z.output<Schema>> }
        | RawBuilder<z.output<Schema>>
        | undefined;
    },
    opts?: ApiOptions & { isTransaction: boolean }
  ) {
    const ops: Array<PActionBody & { key: string }> = Object.keys(
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

    const data = await this.ky.transaction().execute(async trx => {
      const result = [];
      for (const o of body.operations) {
        if (o.action === 'batchAllSmt') {
          const bResult: any = [];
          for (const b of o.batch) {
            const bv = await trx.executeQuery(b as unknown as CompiledQuery);
            bResult.push(bv);
          }
          result.push({ key: o.key, rows: bResult });
        } else {
          const v = o.action
            ? await trx.executeQuery(o as unknown as CompiledQuery)
            : { rows: [] };
          result.push({ key: o.key, rows: v.rows });
        }
      }
      return result;
    });

    return {
      data: data,
      getOne: <X = any>(
        key: V,
        table?: keyof z.output<Schema>,
        extend?: ZodObject<any, any>
      ): X | undefined => {
        const v = data.find(o => o.key === key);
        if (!v) return undefined;
        const name =
          table ??
          (body.operations.find(o => o.key === key)
            ?.table as keyof z.output<Schema>);
        if (!name) return undefined;
        if (Array.isArray(v.rows)) {
          return this.parseMany(v.rows, name, extend)?.[0];
        }
        return this.parseOne(v.rows, name, extend);
      },
      getMany: <X = any>(
        key: V,
        table?: string,
        extend?: ZodObject<any, any>
      ): X[] => {
        const v = data.find(o => o.key === key);
        if (!v) return [];
        const name =
          table ?? body.operations.find(o => o.key === key)?.table ?? '';
        return this.parseMany(v.rows, name as any, extend);
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
    const api = new PostgresApi({
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
