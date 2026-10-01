import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { closeDb } from "./db";
import { routes } from "./api-contract";
import { joinWithInvite } from "./invite";
import { GET as listLinks, POST as createLink } from "@/app/api/v1/invite-links/route";
import { POST as revokeLink } from "@/app/api/v1/invite-links/[id]/revoke/route";
import { GET as listInvitees } from "@/app/api/v1/invitees/route";
import { PATCH as setLockOut } from "@/app/api/v1/invitees/[userId]/route";

// The owner gate is the proxy's and requireOwner's job (auth.test.ts); here it stands in as "the Owner".
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth")>(), requireOwner: vi.fn().mockResolvedValue("owner"),
}));

let containerId: string | undefined;
let sql: postgres.Sql;
const oldUrl = process.env.SUPABASE_DB_URL;

function docker(...args: string[]) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

beforeAll(async () => {
  containerId = docker("run", "--rm", "-d", "-e", "POSTGRES_PASSWORD=invite-admin-test-only", "-p", "127.0.0.1::5432", "postgres:16-alpine");
  const port = Number(docker("port", containerId, "5432/tcp").match(/:(\d+)$/)?.[1]);
  process.env.SUPABASE_DB_URL = `postgres://postgres:invite-admin-test-only@127.0.0.1:${port}/postgres`;
  sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false, connect_timeout: 1 });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await sql`select 1`; break; }
    catch {
      if (attempt === 99) throw new Error("Disposable Postgres did not become ready");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  execFileSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], { cwd: process.cwd(), env: process.env });
}, 60_000);

afterAll(async () => {
  await closeDb();
  await sql?.end();
  if (containerId) docker("rm", "-f", containerId);
  if (oldUrl === undefined) delete process.env.SUPABASE_DB_URL;
  else process.env.SUPABASE_DB_URL = oldUrl;
});

const json = (method: string, path: string, body?: unknown) => new Request(`http://localhost${path}`, {
  method, headers: { "content-type": "application/json", origin: "http://localhost" },
  body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
});
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });

describe("Invite link administration", () => {
  it("creates a link with a label and an optional use cap, then lists it", async () => {
    const created = await createLink(json("POST", "/api/v1/invite-links", { label: "  LinkedIn post  ", useCap: 100 }));
    expect(created.status).toBe(201);
    const link = routes.createInviteLink.responses[201].parse(await created.json());
    expect(link).toMatchObject({ label: "LinkedIn post", useCap: 100, useCount: 0, revoked: false });

    const uncapped = routes.createInviteLink.responses[201].parse(await (await createLink(json("POST", "/api/v1/invite-links", { label: "Friends" }))).json());
    expect(uncapped.useCap).toBeNull();

    const listed = await listLinks(json("GET", "/api/v1/invite-links"));
    expect(listed.status).toBe(200);
    expect(routes.listInviteLinks.responses[200].parse(await listed.json()).items.map((item) => item.id)).toEqual([uncapped.id, link.id]);
  });

  it("rejects a blank label, a bad cap and undeclared fields", async () => {
    for (const body of [{ label: " " }, { label: "x", useCap: 0 }, { label: "x", useCap: 1.5 }, { label: "x", extra: 1 }, {}, "{"]) {
      const response = await createLink(json("POST", "/api/v1/invite-links", body));
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(routes.createInviteLink.responses[400].parse(await response.json()).code).toBe("invalid_request");
    }
  });

  it("revokes a link, and 404s one that does not exist", async () => {
    const link = routes.createInviteLink.responses[201].parse(await (await createLink(json("POST", "/api/v1/invite-links", { label: "Old" }))).json());
    const revoked = await revokeLink(json("POST", `/api/v1/invite-links/${link.id}/revoke`), ctx({ id: String(link.id) }));
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ revoked: true });
    const [row] = await sql`select revoked_at from invite_link where id = ${link.id}`;
    expect(row!.revoked_at).not.toBeNull();

    const missing = await revokeLink(json("POST", "/api/v1/invite-links/999999/revoke"), ctx({ id: "999999" }));
    expect(missing.status).toBe(404);
    const invalid = await revokeLink(json("POST", "/api/v1/invite-links/abc/revoke"), ctx({ id: "abc" }));
    expect(invalid.status).toBe(400);
  });
});

describe("Invitee administration", () => {
  const userId = "00000000-0000-4000-8000-0000000000aa";

  it("lists Invitees with email, Invite link, joined and last seen, and locks one out", async () => {
    const link = routes.createInviteLink.responses[201].parse(await (await createLink(json("POST", "/api/v1/invite-links", { label: "Launch" }))).json());
    await joinWithInvite({ userId, email: "ana@example.test", token: link.token });

    const listed = await listInvitees(json("GET", "/api/v1/invitees"));
    expect(listed.status).toBe(200);
    const { items } = routes.listInvitees.responses[200].parse(await listed.json());
    expect(items).toMatchObject([{ userId, email: "ana@example.test", inviteLink: { id: link.id, label: "Launch" }, lockedOut: false }]);
    expect(items[0]!.lastSeenAt).not.toBeNull();

    const locked = await setLockOut(json("PATCH", `/api/v1/invitees/${userId}`, { lockedOut: true }), ctx({ userId }));
    expect(locked.status).toBe(200);
    expect(routes.setInviteeLockOut.responses[200].parse(await locked.json()).lockedOut).toBe(true);
    expect(await sql`select locked_out from invitee where user_id = ${userId}`).toMatchObject([{ locked_out: true }]);

    const unlocked = await setLockOut(json("PATCH", `/api/v1/invitees/${userId}`, { lockedOut: false }), ctx({ userId }));
    expect(routes.setInviteeLockOut.responses[200].parse(await unlocked.json()).lockedOut).toBe(false);
  });

  it("404s an unknown Invitee and 400s a malformed id or body", async () => {
    const unknown = "00000000-0000-4000-8000-0000000000bb";
    expect((await setLockOut(json("PATCH", `/api/v1/invitees/${unknown}`, { lockedOut: true }), ctx({ userId: unknown }))).status).toBe(404);
    expect((await setLockOut(json("PATCH", "/api/v1/invitees/nope", { lockedOut: true }), ctx({ userId: "nope" }))).status).toBe(400);
    expect((await setLockOut(json("PATCH", `/api/v1/invitees/${userId}`, { lockedOut: "yes" }), ctx({ userId }))).status).toBe(400);
    expect((await setLockOut(json("PATCH", `/api/v1/invitees/${userId}`, "{"), ctx({ userId }))).status).toBe(400);
  });
});
