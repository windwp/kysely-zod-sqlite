import { uid } from 'uid';
export function pid(prefix?: string, length = 16) {
  if (!pid) return uid(length);
  return `${prefix}_${uid(length)}`;
}
