const { exercises } = require('../shared/dist');
const fs = require('node:fs');
const rows = exercises.map(e => `('${e.id}', '${JSON.stringify(e).replaceAll("'", "''")}'::jsonb)`).join(',\n');
fs.writeFileSync('supabase/seed.sql', `-- Generated from shared/src/catalog.ts with node scripts/seed.cjs\ninsert into public.exercises(id,data) values\n${rows}\non conflict(id) do update set data=excluded.data;\n`);
