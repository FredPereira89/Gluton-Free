import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { closeDb } from "./db";
import { isActiveInvitee } from "./auth";
import {
  createInviteLink, generateInviteToken, inviteLinkIsOpen, isInviteeEmail, joinWithInvite,
  listInviteLinks, listInvitees, revokeInviteLink, setInviteeLockedOut,
} from "./invite";

let containerId: string | undefined;
let sql: postgres.Sql;
const oldUrl = process.env.SUPABASE_DB_URL;

function docker(...args: string[]) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

beforeAll(async () => {
  containerId = docker("run", "--rm", "-d", "-e", "POSTGRES_PASSWORD=invite-test-only", "-p", "127.0.0.1::5432", "postgres:16-alpine");
  const port = Number(docker("port", containerId, "5432/tcp").match(/:(\d+)$/)?.[1]);
  process.env.SUPABASE_DB_URL = `postgres://postgres:invite-test-only@127.0.0.1:${port}/postgres`;
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

let nextUser = 0;
const newUser = () => `00000000-0000-4000-8000-${String(++nextUser).padStart(12, "0")}`;
const join = (token: string, userId = newUser(), email = `${userId}@example.test`) => joinWithInvite({ userId, email, token });

describe("Invite links", () => {
  it("creates an unguessable token and lists links newest first with their use", async () => {
    const first = await createInviteLink("LinkedIn post", 100);
    const second = await createInviteLink("Friends", null);
    expect(first).toMatchObject({ label: "LinkedIn post", useCap: 100, useCount: 0, revoked: false });
    expect(second).toMatchObject({ label: "Friends", useCap: null, useCount: 0, revoked: false });
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.token).not.toBe(first.token);
    expect(generateInviteToken()).not.toBe(generateInviteToken());
    const listed = await listInviteLinks();
    expect(listed.map((link) => link.id).slice(0, 2)).toEqual([second.id, first.id]);
  });

  it("revokes a link, idempotently, and reports a link that does not exist", async () => {
    const link = await createInviteLink("Old", null);
    expect(await revokeInviteLink(link.id)).toBe(true);
    expect(await revokeInviteLink(link.id)).toBe(true);
    expect((await listInviteLinks()).find((item) => item.id === link.id)?.revoked).toBe(true);
    expect(await revokeInviteLink(999_999)).toBe(false);
  });

  it("is open only while it is not revoked and under its cap", async () => {
    const open = await createInviteLink("Open", null);
    const revoked = await createInviteLink("Revoked", null);
    await revokeInviteLink(revoked.id);
    const capped = await createInviteLink("One seat", 1);
    expect(await inviteLinkIsOpen(open.token)).toBe(true);
    expect(await inviteLinkIsOpen(revoked.token)).toBe(false);
    expect(await inviteLinkIsOpen(capped.token)).toBe(true);
    await join(capped.token);
    expect(await inviteLinkIsOpen(capped.token)).toBe(false);
    expect(await inviteLinkIsOpen("not-a-token")).toBe(false);
    expect(await inviteLinkIsOpen(generateInviteToken())).toBe(false);
  });
});

describe("joining through an Invite link", () => {
  it("records an Invitee tied to the link and counts one use", async () => {
    const link = await createInviteLink("Join", null);
    const userId = newUser();
    expect(await join(link.token, userId, "Ana@Example.test")).toBe("joined");
    expect(await sql`select user_id, email, invite_link_id, locked_out, last_seen_at is not null as seen from invitee where user_id = ${userId}`)
      .toMatchObject([{ user_id: userId, email: "Ana@Example.test", invite_link_id: String(link.id), locked_out: false, seen: true }]);
    expect((await listInviteLinks()).find((item) => item.id === link.id)?.useCount).toBe(1);
  });

  it("does not count a second sign-in by the same person", async () => {
    const link = await createInviteLink("Twice", null);
    const userId = newUser();
    expect(await join(link.token, userId)).toBe("joined");
    expect(await join(link.token, userId)).toBe("existing");
    const other = await createInviteLink("Other link", null);
    expect(await join(other.token, userId)).toBe("existing");
    expect((await listInviteLinks()).filter((item) => [link.id, other.id].includes(item.id)).map((item) => item.useCount)).toEqual([0, 1]);
    expect(await sql`select invite_link_id from invitee where user_id = ${userId}`).toMatchObject([{ invite_link_id: String(link.id) }]);
  });

  it("refuses a revoked link and creates no Invitee", async () => {
    const link = await createInviteLink("Revoked", null);
    await revokeInviteLink(link.id);
    const userId = newUser();
    expect(await join(link.token, userId)).toBe("refused");
    expect(await sql`select 1 from invitee where user_id = ${userId}`).toEqual([]);
    expect((await listInviteLinks()).find((item) => item.id === link.id)?.useCount).toBe(0);
  });

  it("stops admitting people at the use cap", async () => {
    const link = await createInviteLink("Two seats", 2);
    expect(await join(link.token)).toBe("joined");
    expect(await join(link.token)).toBe("joined");
    const late = newUser();
    expect(await join(link.token, late)).toBe("refused");
    expect(await sql`select 1 from invitee where user_id = ${late}`).toEqual([]);
    expect((await listInviteLinks()).find((item) => item.id === link.id)?.useCount).toBe(2);
  });

  it("never lets simultaneous sign-ins exceed the cap", async () => {
    const link = await createInviteLink("Race", 3);
    const results = await Promise.all(Array.from({ length: 8 }, () => join(link.token)));
    expect(results.filter((result) => result === "joined")).toHaveLength(3);
    expect(results.filter((result) => result === "refused")).toHaveLength(5);
    expect((await listInviteLinks()).find((item) => item.id === link.id)?.useCount).toBe(3);
  });

  it("refuses an unknown token", async () => {
    expect(await join(generateInviteToken())).toBe("refused");
  });

  it("refuses a locked-out Invitee even through a valid link", async () => {
    const link = await createInviteLink("Locked", null);
    const userId = newUser();
    await join(link.token, userId);
    await setInviteeLockedOut(userId, true);
    expect(await join(link.token, userId)).toBe("refused");
  });
});

describe("managing Invitees", () => {
  it("lists email, Invite link, joined and last seen", async () => {
    const link = await createInviteLink("Listed", null);
    const userId = newUser();
    await join(link.token, userId, "listed@example.test");
    const invitee = (await listInvitees()).find((item) => item.userId === userId);
    expect(invitee).toMatchObject({ email: "listed@example.test", inviteLink: { id: link.id, label: "Listed" }, lockedOut: false });
    expect(Date.parse(invitee!.joinedAt)).not.toBeNaN();
    expect(Date.parse(invitee!.lastSeenAt!)).not.toBeNaN();
  });

  it("locks an Invitee out and back in, and reports one who does not exist", async () => {
    const link = await createInviteLink("Lock", null);
    const userId = newUser();
    await join(link.token, userId);
    expect(await isActiveInvitee(userId)).toBe(true);
    expect(await setInviteeLockedOut(userId, true)).toMatchObject({ userId, lockedOut: true });
    expect(await isActiveInvitee(userId)).toBe(false);
    expect(await setInviteeLockedOut(userId, false)).toMatchObject({ userId, lockedOut: false });
    expect(await isActiveInvitee(userId)).toBe(true);
    expect(await setInviteeLockedOut(newUser(), true)).toBeNull();
  });

  it("knows an Invitee by email, ignoring case, unless locked out", async () => {
    const link = await createInviteLink("Email", null);
    const userId = newUser();
    await join(link.token, userId, "Member@Example.test");
    expect(await isInviteeEmail("member@example.TEST")).toBe(true);
    expect(await isInviteeEmail("stranger@example.test")).toBe(false);
    await setInviteeLockedOut(userId, true);
    expect(await isInviteeEmail("member@example.test")).toBe(false);
  });

  it("records last seen on an Invitee's requests, at most every few minutes", async () => {
    const link = await createInviteLink("Seen", null);
    const userId = newUser();
    await join(link.token, userId);
    await sql`update invitee set last_seen_at = now() - interval '1 hour' where user_id = ${userId}`;
    expect(await isActiveInvitee(userId)).toBe(true);
    const [fresh] = await sql`select last_seen_at from invitee where user_id = ${userId}`;
    expect(Date.now() - fresh!.last_seen_at.getTime()).toBeLessThan(60_000);
    await isActiveInvitee(userId);
    const [again] = await sql`select last_seen_at from invitee where user_id = ${userId}`;
    expect(again!.last_seen_at).toEqual(fresh!.last_seen_at);
  });
});
