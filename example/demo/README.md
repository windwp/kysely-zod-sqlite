## How to use
- open wrangler.toml change d1_database config to your d1 db.
- add a enviroment DB_API_KEY to your worker
- run `wrangler d1 execute public-test-db --file=../../migrations/0000_init.sql`
