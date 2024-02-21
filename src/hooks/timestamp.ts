import { PHooks } from '../types';

export function hookTimeStamp(k?: { create: string; update: string }) {
  const key = k ?? { update: 'updated_at', create: 'created_at' };
  return {
    onInsert(value, ctx) {
      if (!value[key.create] && ctx.schema.shape[key.create]) {
        value[key.create] = new Date();
      }
      if (!value[key.update] && ctx.schema.shape[key.update]) {
        value[key.update] = new Date();
      }
      return value;
    },
    onUpdate(value: any, ctx: any) {
      if (value[key.update] && ctx.schema.shape[key.update]) {
        value[key.update] = new Date();
      }
    },
  } satisfies PHooks;
}
