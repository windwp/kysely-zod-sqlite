import { uid as id } from 'uid';
//increase default
export function uid(length = 18) {
  return id(length);
}
