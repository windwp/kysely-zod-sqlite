import { PQuery, SqliteApi } from '../src/SqliteApi';
import {
  Database,
  PostTable,
  UserTable,
  postTable,
  userTable,
} from './kysely-schema';

export class TestApi extends SqliteApi<Database> {
  get TestUser() {
    return this.table<UserTable>().create(userTable);
  }
  get TestPost() {
    return this.table<PostTable>().create(postTable);
  }
}
