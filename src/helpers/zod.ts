import { z } from 'zod';
import { parse, parseISO } from 'date-fns';

// some custom zod to parse sqlite data
export const zBoolean = z.custom<boolean>().transform(value => {
  if (typeof value === 'boolean') return value;
  return value === 'true';
});

export function zJsonString<T>(schema: z.Schema<T>) {
  return z.custom<T>().transform((v, ctx): T => {
    if (!v) return v;
    if (typeof v === 'string') {
      try {
        return schema.parse(JSON.parse(v));
      } catch (e: any) {
        ctx.addIssue({
          code: 'custom',
          message: e.message,
        });
        return z.NEVER;
      }
    }
    return v;
  });
}

export const zDate = z
  .custom<Date>()
  .transform((v, ctx) => {
    if (!v) return v;
    if (v instanceof Date) return v;
    if (typeof v === 'string') {
      if ((v as string).length == 24) return parseISO(v);

      //default format of sqlite date
      return parse(v, 'yyyy-MM-dd HH:mm:ss', new Date());
    }
    ctx.addIssue({
      code: 'invalid_date',
    });
    return z.NEVER;
  })
  .optional();