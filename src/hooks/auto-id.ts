import { PHooks } from '../types';

export function hookAutoId(fnc?: () => string) {
  return {
    onInsert(value, ctx) {
      if (!value.id && ctx.autoId) {
        value.id = fnc ? fnc() : crypto.randomUUID();
      }
      return value;
    },
  } satisfies PHooks;
}
