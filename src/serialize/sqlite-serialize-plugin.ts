import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely';
import type { QueryId } from 'kysely/dist/cjs/util/query-id';
import { SerializeParametersTransformer } from './sqlite-serialize-transformer';
import { Logger } from 'loglevel';

export interface SqliteSerializePluginOptions {
  serializer?: SerializeParametersTransformer;
  shape?: any;
  logger?: Logger;
}

export class SqliteSerializePlugin implements KyselyPlugin {
  private serializeParametersTransformer: SerializeParametersTransformer;
  private ctx: WeakMap<QueryId, string>;
  private shape: any;
  private logger?: Logger;

  public constructor(opt: SqliteSerializePluginOptions) {
    this.shape = opt.shape;
    this.logger = opt.logger;
    this.serializeParametersTransformer = new SerializeParametersTransformer();
    this.ctx = new WeakMap();
  }

  public transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    const { node, queryId } = args;
    if (node.kind === 'SelectQueryNode' && !node.joins) {
      const table = (node as any).from?.froms[0]?.table.identifier?.name;
      if (table) {
        this.ctx.set(queryId, table);
      }
    }
    const data = this.serializeParametersTransformer.transformNode(args.node);
    return data;
  }

  private parseResult(rows: any[], table: string) {
    if (this.shape?.[table]) {
      try {
        return Promise.resolve(
          rows.map(row =>
            row ? this.shape[table].partial().passthrough().parse(row) : row
          )
        );
      } catch (error: any) {
        this.logger?.error(`zod serialize: ${error.message}`);
        this.logger?.error(rows);
        throw new Error(`Parse table: ${table} => ${error.message}`);
      }
    }
    return rows;
  }

  public async transformResult(
    args: PluginTransformResultArgs
  ): Promise<QueryResult<UnknownRow>> {
    const { result, queryId } = args;
    const ctx = this.ctx.get(queryId);
    return result.rows && ctx
      ? {
          ...args.result,
          rows: await this.parseResult(result.rows, ctx),
        }
      : args.result;
  }
}
