import { uid } from 'uid';
export function pid(prefix?: string, length = 18) {
  if (!prefix) return uid(length);
  return `${prefix}_${uid(length)}`;
}
