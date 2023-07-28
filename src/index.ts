import { uid } from 'uid';

export { SqliteApi, PQuery } from './SqliteApi';
export { zBoolean, zJsonString, zDate } from './helpers/zod';

export function pid(prefix?: string, length = 16) {
  if (!pid) return uid(length);
  return `${prefix}_${uid(length)}`;
}
