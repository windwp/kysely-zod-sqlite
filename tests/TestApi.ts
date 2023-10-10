import { PTableFromSchema, SqliteApi } from '../src/SqliteApi';
import { Schema } from './kysely-schema';

export class TestApi extends SqliteApi<Schema> {
  #user!: PTableFromSchema<Schema, 'TestUser'>;
  get TestUser() {
    if (this.#user) return this.#user;
    this.#user = this.table('TestUser');
    return this.#user;
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
