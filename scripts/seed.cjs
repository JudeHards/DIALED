const { exercises, catalogSchema } = require('../shared/dist');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--migration' || !/^\d{12}_[a-z0-9_]+\.sql$/.test(args[1]))) {
  throw new Error('Usage: node scripts/seed.cjs [--migration YYYYMMDDNNNN_name.sql]');
}
const catalog = exercises.map(exercise => catalogSchema.parse(exercise));
if (new Set(catalog.map(exercise => exercise.id)).size !== catalog.length) throw new Error('Duplicate exercise IDs');
const quote = value => `'${value.replaceAll("'", "''")}'`;
const rows = catalog.map(exercise => `(${quote(exercise.id)}, ${quote(JSON.stringify(exercise))}::jsonb)`).join(',\n');
const sql = `-- Generated from shared/src/catalog.ts with node scripts/seed.cjs\ninsert into public.exercises(id,data) values\n${rows}\non conflict(id) do update set data=excluded.data;\n`;
const supabase = path.resolve(__dirname, '../supabase');
if (args.length) {
  // Never overwrite a migration that may already have been applied.
  fs.writeFileSync(path.join(supabase, 'migrations', args[1]), `-- Catalogue upgrade only; existing workout snapshots remain unchanged.\n${sql}`, { flag: 'wx' });
}
fs.writeFileSync(path.join(supabase, 'seed.sql'), sql);
