import { PHooks } from '../types';

export function hookTimeStamp(key: { createdAt: string; updatedAt: string }) {
  return {
    onInsert(value: any, ctx) {
      if (ctx.schema.shape[key.createdAt]) value[key.createdAt] = new Date();
      if (ctx.schema.shape[key.updatedAt]) value[key.updatedAt] = new Date();
      return value;
    },
    onUpdate(value: any, ctx: any) {
      if (ctx.schema.shape[key.updatedAt]) value[key.updatedAt] = new Date();
    },
  } satisfies PHooks;
}
