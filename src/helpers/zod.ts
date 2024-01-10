import { parse, parseISO } from 'date-fns';
import {
  OK,
  ParseInput,
  UnknownKeysParam,
  ZodBooleanDef,
  ZodDate,
  ZodFirstPartyTypeKind,
  ZodObject,
  ZodRawShape,
  ZodType,
  ZodTypeAny,
  objectInputType,
  objectOutputType,
  z,
} from 'zod';

// parse json and parse child with schema
export function zJsonSchema<T>(schema: z.Schema<T>, defaultValue?: T) {
  return z.custom<T>().transform((v, ctx): T => {
    if (v === '' || (!v && schema.isOptional())) return defaultValue as T;
    if (typeof v !== 'string') return schema.parse(v);
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
    if ((v as unknown) === '') return defaultValue ?? [];
    if (!v || typeof v !== 'string') return v;
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
    .custom<T & { __relations?: any }>()
    .transform((v, ctx): T => {
      if ((v as unknown) === '') return (defaultValue ?? {}) as T;
      if (!v || typeof v !== 'string') return v;
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

export function zString<T>() {
  return z.string() as unknown as ZodType<T, any, T>;
}

export function zRelationMany<T>(
  relation: TableRelation<T>,
  defaultValue?: T[] extends { parse: any } ? never : T[]
) {
  return z
    .custom<Array<T & { __relations?: TableRelation<T> }>>()
    .transform((v, ctx): Array<T> => {
      if ((v as unknown) === '') return (defaultValue as T[]) ?? [];
      if (!v || typeof v !== 'string') return v;
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
    if (!input.data) {
      input.data = undefined;
      return OK(input.data);
    }
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

export class ZodKyBoolean extends ZodType<
  boolean,
  ZodBooleanDef,
  boolean | undefined
> {
  _parse(input: ParseInput) {
    if (typeof input.data !== 'boolean') {
      input.data = input.data === 1 || input.data === 'true';
    }
    input.data = Boolean(input.data);
    return OK(input.data);
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
  }).optional();

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
