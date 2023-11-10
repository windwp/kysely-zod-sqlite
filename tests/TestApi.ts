import { SqliteApi } from '../src/api/sqlite-api';
import { PTableFromSchema , PApi } from '../src/api/papi';
import { Schema } from './kysely-schema';
import { PostgresApi } from '../src/api/postgres-api';

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

export class TestPostgresApi extends PostgresApi<Schema> {
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
