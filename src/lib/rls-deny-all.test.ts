import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ADR 0006: RLS is on for every table with no policies, so the Data API exposes nothing.
const dir = new URL("../../db/migrations/", import.meta.url);
const sql = readdirSync(dir).filter((file) => file.endsWith(".sql")).sort().map((file) => readFileSync(new URL(file, dir), "utf8")).join("\n");

describe("row level security stays deny-all", () => {
  it("enables RLS on every table the migrations create", () => {
    const created = [...sql.matchAll(/create table (?:if not exists )?(\w+)/gi)].map((match) => match[1]);
    const secured = new Set([...sql.matchAll(/alter table (\w+)\s+enable row level security/gi)].map((match) => match[1]));
    expect(created).toContain("invitee");
    expect(created.filter((table) => !secured.has(table))).toEqual([]);
  });

  it("defines no policy", () => {
    expect(sql).not.toMatch(/create policy/i);
  });
});
