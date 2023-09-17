import fs from 'fs';
// stupid ts esm:)
const path = './dist/SqliteApi.js';
fs.writeFileSync(
  path,
  fs
    .readFileSync(path, 'utf-8')
    .replace('kysely/helpers/sqlite.js', 'kysely/helpers/sqlite'),'utf-8'
);
