import { uid as id } from 'uid';
//increase default
export function uid(length = 24) {
  return id(length);
}
