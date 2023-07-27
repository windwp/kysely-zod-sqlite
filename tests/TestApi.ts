import { ShortSyntax, SqliteApi } from '../src/SqliteApi';
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
    return new ShortSyntax<UserTable, UserRelation>(this.db, userTable);
  }
  get TestPost() {
    return new ShortSyntax<PostTable, PostRelation>(this.db, postTable);
  }
}
