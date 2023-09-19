import { SqliteApi } from '../src/SqliteApi';
import { Schema } from './kysely-schema';

export class TestApi extends SqliteApi<Schema> {
  get TestUser() {
    return this.table('TestUser');
  }
  get TestPost() {
    return this.table('TestPost');
  }
  get TestNoId() {
    return this.table('TestNoId');
  }
  get TestOrder() {
    return this.table('TestOrder');
  }
}
