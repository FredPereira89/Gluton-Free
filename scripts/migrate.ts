// Applies db/migrations/*.sql in name order, once each.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { closeDb, db } from "../src/lib/db";

const dir = path.resolve("db/migrations");

async function main() {
  const sql = db();
  await sql`create table if not exists schema_migration (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table schema_migration enable row level security`;
  const applied = new Set((await sql<{ name: string }[]>`select name from schema_migration`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migration (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }
  console.log("migrations up to date");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
