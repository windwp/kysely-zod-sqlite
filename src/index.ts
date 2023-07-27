import { uid } from 'uid';

export { SqliteApi, PQuery } from './SqliteApi';
export { zBoolean, zJsonString } from './helpers/zod';

export function pid(prefix: string, length = 10) {
  return `${prefix}_${uid(length)}`;
}
