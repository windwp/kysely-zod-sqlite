import { PHooks } from '../types';

export function hookTimeStamp(
  createdKey = 'createdAt',
  updatedKey = 'updateAt'
) {
  return {
    onInsert(value: any, ctx) {
      if (ctx.schema.shape[createdKey]) value[createdKey] = new Date();
      return value;
    },
    onUpdate(value: any, ctx: any) {
      if (ctx.schema.shape[createdKey]) value[createdKey] = new Date();
      if (ctx.schema.shape[updatedKey]) value[updatedKey] = new Date();
    },
  } satisfies PHooks;
}
