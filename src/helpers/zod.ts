import { ZodObject, ZodRawShape, ZodTypeAny, z } from 'zod';
import { parse, parseISO } from 'date-fns';

// some custom zod to parse sqlite data

export const zBoolean = z.custom<boolean>().transform(value => {
  if (typeof value === 'boolean') return value;
  return value === 1 || value === 'true';
});

// parse json and parse child with schema
export function zJsonSchema<T>(schema: z.Schema<T>, defaultValue?: T) {
  return z.custom<T>().transform(
    (v, ctx): T => {
      if (!v || typeof v !== 'string') return v;
      if (v === '') return (defaultValue ?? {}) as T;
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
  );
}
export function zJsonObject<T>(
  defaultValue?: T extends { parse: any } ? never : T
) {
  return z.custom<T>().transform(
    (v, ctx): T => {
      if (!v || typeof v !== 'string') return v;
      if (v === '') return (defaultValue ?? {}) as T;
      try {
        return JSON.parse(v);
      } catch (e: any) {
        ctx.addIssue({
          code: 'custom',
          message: e.message,
        });
        return z.NEVER;
      }
    }
  );
}

export function zJsonArray<T>(
  defaultValue?: T[] extends { parse: any }[] ? never : T[]
) {
  return z.custom<T[]>().transform((v, ctx): T[] => {
    if (!v || typeof v !== 'string') return v;
    if (v === '') return defaultValue ?? [];
    try {
      return JSON.parse(v);
    } catch (e: any) {
      ctx.addIssue({
        code: 'custom',
        message: e.message,
      });
      return z.NEVER;
    }
  });
}

export type TableRelation<T> = {
  ref: string;
  table: string;
  refTarget: string;
  select?: string[];
  schema?: z.Schema<T>;
};

export function zRelationOne<T>(
  relation: TableRelation<T>,
  defaultValue?: T extends { parse: any } ? never : T
) {
  return z
    .custom<T>()
    .transform((v, ctx): T & { __relations: TableRelation<T> } => {
      if (!v || typeof v !== 'string') return v as any;
      if (v === '') return (defaultValue ?? {}) as any;
      try {
        return JSON.parse(v);
      } catch (e: any) {
        ctx.addIssue({
          code: 'custom',
          message: e.message,
        });
        return z.NEVER;
      }
    })
    .optional()
    .describe({ ...relation, type: 'one' } as any);
}

export function zRelationMany<T>(
  relation: TableRelation<T>,
  defaultValue?: T[] extends { parse: any } ? never : T[]
) {
  return z
    .custom<Array<T & { __relations: TableRelation<T> }>>()
    .transform((v, ctx): T[] => {
      if (!v || typeof v !== 'string') return v;
      if (v === '') return defaultValue ?? [];
      try {
        return JSON.parse(v);
      } catch (e: any) {
        ctx.addIssue({
          code: 'custom',
          message: e.message,
        });
        return z.NEVER;
      }
    })
    .optional()
    .describe({ ...relation, type: 'many' } as any);
}

export const zDate = z
  .custom<Date>()
  .transform(
    (v, ctx): Date => {
      if (!v || v instanceof Date) return v;
      if (typeof v === 'string') {
        if ((v as string).length == 24) return parseISO(v);

        //default format of sqlite date
        return parse(v, 'yyyy-MM-dd HH:mm:ss', new Date());
      }
      ctx.addIssue({
        code: 'invalid_date',
      });
      return z.NEVER;
    }
  )
  .optional();
