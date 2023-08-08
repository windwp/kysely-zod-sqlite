import { SqliteApi } from '../src/SqliteApi';
import { Database } from './kysely-schema';

export class TestApi extends SqliteApi<Database> {
  get TestUser() {
    return this.table('TestUser');
  }
  get TestPost() {
    return this.table('TestPost');
  }
}
