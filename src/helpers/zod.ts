import { parse, parseISO } from 'date-fns';
import {
  OK,
  ParseInput,
  UnknownKeysParam,
  ZodBoolean,
  ZodDate,
  ZodFirstPartyTypeKind,
  ZodObject,
  ZodRawShape,
  ZodTypeAny,
  objectInputType,
  objectOutputType,
  z,
} from 'zod';

// parse json and parse child with schema
export function zJsonSchema<T>(schema: z.Schema<T>, defaultValue?: T) {
  return z.custom<T>().transform((v, ctx): T => {
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
  });
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

export class ZodKyDate extends ZodDate {
  _parse(input: ParseInput) {
    if (typeof input.data === 'string') {
      if ((input.data as string).length == 24) {
        input.data = parseISO(input.data);
      } else {
        input.data = parse(input.data, 'yyyy-MM-dd HH:mm:ss', new Date());
      }
    }
    return super._parse(input);
  }
}

export class ZodKyBoolean extends ZodBoolean {
  _parse(input: ParseInput) {
    if (typeof input.data !== 'boolean') {
      input.data = input.data === 1 || input.data === 'true';
    }
    return super._parse(input);
  }
}

export class ZodKyJsonString<
  T extends ZodRawShape,
  UnknownKeys extends UnknownKeysParam = UnknownKeysParam,
  Catchall extends ZodTypeAny = ZodTypeAny,
  Output = objectOutputType<T, Catchall, UnknownKeys>,
  Input = objectInputType<T, Catchall, UnknownKeys>
> extends ZodObject<T, UnknownKeys, Catchall, Output, Input> {
  _parse(input: ParseInput) {
    if (typeof input.data === 'string') {
      input.data = input.data === '' ? {} : JSON.parse(input.data);
    }
    return OK(input.data);
  }
}

export const zBoolean = () =>
  new ZodKyBoolean({
    coerce: false,
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
  });

export const zDate = () =>
  new ZodKyDate({
    coerce: false,
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodDate,
  });

export function zJsonObject<T extends Record<string, any>>() {
  const v = new ZodKyJsonString<
    ZodRawShape,
    UnknownKeysParam,
    ZodTypeAny,
    T,
    T
  >({
    typeName: ZodFirstPartyTypeKind.ZodObject,
    unknownKeys: 'passthrough',
    catchall: z.any(),
    shape: () => ({}),
  });
  return v;
}
