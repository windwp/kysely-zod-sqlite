import { PHooks } from '../types';

export function hookAutoId(fnc?: () => string) {
  return {
    onInsert(value: any, ctx) {
      if (ctx.schema.shape.id?._def.typeName === 'ZodString') {
        value.id = fnc ? fnc() : crypto.randomUUID();
      }
      return value;
    },
  } satisfies PHooks;
}
