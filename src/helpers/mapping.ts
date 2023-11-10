import type { QueryRelations, TableRelation } from "../types";

export function mappingQueryOptions<V>(
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
export function mappingRelations<V>(
  query: any,
  table: string,
  relations: { [k: string]: TableRelation },
  opts: QueryRelations<V>,
  jsonHelpers: {
    jsonArrayFrom: (query: any) => any;
    jsonObjectFrom: (query: any) => any;
  }
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
        relation.type == 'one'
          ? jsonHelpers.jsonObjectFrom
          : jsonHelpers.jsonArrayFrom;
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


