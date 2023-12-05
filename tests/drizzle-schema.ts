import { int, text, sqliteTable, customType } from 'drizzle-orm/sqlite-core';

const customDate = customType<{ data: Date }>({
  dataType() {
    return 'text';
  },
  toDriver(value) {
    return value.toISOString();
  },
  fromDriver(value) {
    return new Date(value as string);
  },
});

const customJson = customType<{ data: any }>({
  dataType() {
    return 'text';
  },
  toDriver(value) {
    return value ? JSON.stringify(value) : '{}';
  },
  fromDriver(value) {
    if (typeof value === 'string') {
      return JSON.parse(value);
    }
    return value;
  },
});

export const users = sqliteTable('test_users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email'),
  data: customJson('data').$type<{ value: string; name: string }>(),
  config: customJson('config').$type<{ language: string; status: string }>(),
  createdAt: customDate('created_at'),
  updatedAt: customDate('updated_at'),
});
