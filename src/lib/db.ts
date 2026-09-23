import postgres from "postgres";

// SUPABASE_DB_URL is the session pooler; the direct host is IPv6-only.
let client: postgres.Sql | undefined;

export function db(): postgres.Sql {
  if (!client) {
    const url = process.env.SUPABASE_DB_URL;
    if (!url) throw new Error("SUPABASE_DB_URL is not set");
    client = postgres(url, {
      max: process.env.VERCEL ? 1 : 4,
      prepare: false,
      idle_timeout: 20,
      onnotice: () => {},
    });
  }
  return client;
}

export async function closeDb(): Promise<void> {
  await client?.end({ timeout: 5 });
  client = undefined;
}
