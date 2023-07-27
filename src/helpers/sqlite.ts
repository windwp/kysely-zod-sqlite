import {
  AliasNode,
  ColumnNode,
  IdentifierNode,
  ReferenceNode,
  sql,
} from 'kysely';

function getJsonObjectArgs(node: any, table: any) {
  return node.selections.flatMap(({ selection: s }: any) => {
    if (ReferenceNode.is(s) && ColumnNode.is(s.column)) {
      return [
        sql.lit(s.column.column.name),
        sql.id(table, s.column.column.name),
      ];
    } else if (ColumnNode.is(s)) {
      return [sql.lit(s.column.name), sql.id(table, s.column.name)];
    } else if (AliasNode.is(s) && IdentifierNode.is(s.alias)) {
      return [sql.lit(s.alias.name), sql.id(table, s.alias.name)];
    } else {
      throw new Error(
        'SQLite jsonArrayFrom and jsonObjectFrom functions can only handle explicit selections due to limitations of the json_object function. selectAll() is not allowed in the subquery.'
      );
    }
  });
}
export function jsonArrayFrom(expr: any) {
  return sql`(select coalesce(json_group_array(json_object(${sql.join(
    getJsonObjectArgs(expr.toOperationNode(), 'agg')
  )})), '[]') from ${expr} as agg)`;
}
