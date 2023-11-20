import { SqliteApi } from '../src/api/sqlite-api';
import { PTableFromSchema , PApi } from '../src/api/papi';
import { Schema } from './kysely-schema';
import { PostgresApi } from '../src/api/postgres-api';

export class TestApi extends SqliteApi<Schema> {
  #user!: PTableFromSchema<Schema, 'test_users'>;
  get test_users() {
    if (this.#user) return this.#user;
    this.#user = this.table('test_users');
    return this.#user;
  }
  get test_posts() {
    return this.table('test_posts');
  }
  get test_noids() {
    return this.table('test_noids');
  }
  get test_orders() {
    return this.table('test_orders');
  }
}

export class test_postsgresApi extends PostgresApi<Schema> {
  #user!: PTableFromSchema<Schema, 'test_users'>;
  get test_users() {
    if (this.#user) return this.#user;
    this.#user = this.table('test_users');
    return this.#user;
  }
  get test_posts() {
    return this.table('test_posts');
  }
  get test_noids() {
    return this.table('test_noids');
  }
  get test_orders() {
    return this.table('test_orders');
  }
}