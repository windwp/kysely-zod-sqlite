import type {
  ColumnUpdateNode,
  PrimitiveValueListNode,
  ValueNode,
} from 'kysely';
import { OperationNodeTransformer } from 'kysely';

export const defaultSerializer = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'boolean') {
    return `${value ? 1 : 0}`;
  }

  if (value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
};

export class SerializeParametersTransformer extends OperationNodeTransformer {
  public constructor() {
    super();
  }

  protected override transformPrimitiveValueList(
    node: PrimitiveValueListNode
  ): PrimitiveValueListNode {
    return {
      ...node,
      values: node.values.map(defaultSerializer),
    };
  }

  // https://www.npmjs.com/package/zodsql

  protected transformColumnUpdate(node: ColumnUpdateNode): ColumnUpdateNode {
    const { value: valueNode } = node;

    if (valueNode.kind !== 'ValueNode') {
      return super.transformColumnUpdate(node);
    }

    const { value, ...item } = valueNode as ValueNode;

    const serializedValue = defaultSerializer(value);

    return value === serializedValue
      ? super.transformColumnUpdate(node)
      : super.transformColumnUpdate({
          ...node,
          value: { ...item, value: serializedValue } as ValueNode,
        });
  }

  protected override transformValue(node: ValueNode): ValueNode {
    return {
      ...node,
      value: defaultSerializer(node.value),
    };
  }
}
