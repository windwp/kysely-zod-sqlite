import fs from 'fs';
// stupid ts esm:)
const path = './dist/api/sqlite-api.js';
fs.writeFileSync(
  path,
  fs
    .readFileSync(path, 'utf-8')
    .replace('kysely/helpers/sqlite.js', 'kysely/helpers/sqlite'),
  'utf-8'
);
{
  const path = './dist/api/postgres-api.js';
  fs.writeFileSync(
    path,
    fs
      .readFileSync(path, 'utf-8')
      .replace('kysely/helpers/postgres.js', 'kysely/helpers/postgres'),
    'utf-8'
  );
}
