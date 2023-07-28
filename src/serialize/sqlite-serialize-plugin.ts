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
  schema?: any;
  logger: Logger;
}

export class SqliteSerializePlugin implements KyselyPlugin {
  private serializeParametersTransformer: SerializeParametersTransformer;
  private ctx: WeakMap<QueryId, string>;
  private schema: any;
  private logger: Logger;

  public constructor(opt: SqliteSerializePluginOptions) {
    this.schema = opt.schema;
    this.logger = opt.logger;
    this.serializeParametersTransformer = new SerializeParametersTransformer();
    this.ctx = new WeakMap();
  }

  public transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    const { node, queryId } = args;
    if (node.kind === 'SelectQueryNode') {
      const tableName = (node as any).from?.froms[0]?.table.identifier?.name;
      if (tableName) {
        this.ctx.set(queryId, tableName);
      }
    }
    const data = this.serializeParametersTransformer.transformNode(args.node);
    return data;
  }

  private parseResult(rows: any[], tableName: string) {
    if (this.schema?.[tableName]) {
      try {
        return Promise.resolve(
          rows.map(row =>
            this.schema[tableName].partial().passthrough().parse(row)
          )
        );
      } catch (error: any) {
        this.logger.error(rows);
        throw new Error(`Parse table: ${tableName} => ${error.message}`);
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
