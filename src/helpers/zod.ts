import { z } from 'zod';

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
