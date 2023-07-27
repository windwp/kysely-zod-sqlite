import { PQuery, SqliteApi } from '../src/SqliteApi';
import {
  Database,
  PostRelation,
  PostTable,
  UserRelation,
  UserTable,
  postTable,
  userTable,
} from './kysely-schema';

export class TestApi extends SqliteApi<Database> {
  get TestUser() {
    return new PQuery<UserTable, UserRelation>(this.db, userTable);
  }
  get TestPost() {
    return new PQuery<PostTable, PostRelation>(this.db, postTable);
  }
}