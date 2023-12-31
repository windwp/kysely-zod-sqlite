import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { zBoolean, zDate, zJsonObject } from '../src';
import { format } from 'date-fns';
import { ExtractFieldsWithRelations } from '../src/types';
import { PostTable, UserTable } from './kysely-schema';

describe('test custom zod ', () => {
  it('should handle date ', async () => {
    const testZod = z.object({
      startDate: zDate(),
    });
    {
      const v = testZod.parse({
        startDate: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      });
      expect(typeof v.startDate?.getTime()).toBe('number');
    }
    {
      const v = testZod.parse({
        startDate: null,
      });
      expect(v.startDate).toBe(undefined);
    }
  });
  it('should handle custom boolean', async () => {
    const boo = zBoolean();
    {
      const v = boo.parse(1);
      expect(v).toBe(true);
    }
    {
      const v = boo.parse(0);
      expect(v).toBe(false);
    }
  });
  it('should handle json', async () => {
    const testjson = z.object({
      data: zJsonObject<{ config: string; value: string }>(),
    });
    {
      const v = testjson.parse({
        data: JSON.stringify({ config: '1234', value: '1234' }),
      });
      expect(v.data.config).toBe('1234');
    }
  });
  it('type check extract', async () => {
    const check: ExtractFieldsWithRelations<UserTable> = {
      posts: [],
    };
    check.posts?.[0];
    const checkPost: ExtractFieldsWithRelations<PostTable> = {
      user: {} as UserTable & { __relations: any },
    };
    checkPost.user?.id;
    const user = {} as UserTable;
    user.posts?.[0];
  });
});
