import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as redeem } from "./invite/route";
import { POST as magicLink } from "./magic-link/route";
import { GET as callback } from "./callback/route";
import { POST as confirm } from "./confirm/route";
import { POST as signOut } from "./sign-out/route";
import { createAuthRouteClient, isActiveInvitee } from "@/lib/auth";
import { inviteLinkIsOpen, isInviteeEmail, joinWithInvite } from "@/lib/invite";

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth")>(), createAuthRouteClient: vi.fn(), isActiveInvitee: vi.fn(),
}));
vi.mock("@/lib/invite", () => ({ inviteLinkIsOpen: vi.fn(), isInviteeEmail: vi.fn(), joinWithInvite: vi.fn() }));

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "A".repeat(43);

const auth = {
  signInWithOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OWNER_USER_ID = OWNER_ID;
  // The PKCE verifier cookie the real client would set when it sends a magic link.
  auth.signInWithOtp.mockResolvedValue({ error: null });
  auth.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: USER_ID, email: "ana@example.test" } }, error: null });
  auth.verifyOtp.mockResolvedValue({ data: { user: { id: USER_ID, email: "ana@example.test" } }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  vi.mocked(createAuthRouteClient).mockImplementation((_request, onSetCookies) => {
    onSetCookies([{ name: "sb-pkce", value: "verifier", options: { path: "/" } }]);
    return { auth } as unknown as ReturnType<typeof createAuthRouteClient>;
  });
  vi.mocked(inviteLinkIsOpen).mockResolvedValue(true);
  vi.mocked(isInviteeEmail).mockResolvedValue(true);
  vi.mocked(joinWithInvite).mockResolvedValue("joined");
  vi.mocked(isActiveInvitee).mockResolvedValue(true);
});

function form(path: string, fields: Record<string, string>) {
  return new Request(`https://app.example${path}`, { method: "POST", body: new URLSearchParams(fields) });
}
const location = (response: Response) => new URL(response.headers.get("location")!, "https://app.example");
const where = (response: Response) => { const url = location(response); return `${url.pathname}${url.search}`; };

describe("POST /api/auth/invite (redeeming an Invite link)", () => {
  it("sends a magic link and remembers the link's token in the new account's metadata", async () => {
    const response = await redeem(form("/api/auth/invite", { token: TOKEN, email: "ana@example.test" }));
    expect(response.status).toBe(303);
    expect(where(response)).toBe(`/invite/${TOKEN}?sent=1`);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "ana@example.test",
      options: { shouldCreateUser: true, data: { invite: TOKEN } },
    });
    expect((response as import("next/server").NextResponse).cookies.get("sb-pkce")?.value).toBe("verifier");
  });

  it("refuses a revoked or exhausted link: no magic link, so no account is created", async () => {
    vi.mocked(inviteLinkIsOpen).mockResolvedValue(false);
    const response = await redeem(form("/api/auth/invite", { token: TOKEN, email: "ana@example.test" }));
    expect(where(response)).toBe(`/invite/${TOKEN}`);
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(createAuthRouteClient).not.toHaveBeenCalled();
  });

  it("asks again for an email that is not one", async () => {
    const response = await redeem(form("/api/auth/invite", { token: TOKEN, email: "not an email" }));
    expect(where(response)).toBe(`/invite/${TOKEN}?error=invalid_email`);
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("says so when the magic link could not be sent", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { message: "rate limited" } });
    const response = await redeem(form("/api/auth/invite", { token: TOKEN, email: "ana@example.test" }));
    expect(where(response)).toBe(`/invite/${TOKEN}?error=send_failed`);
  });

  it("does not echo a malformed token into a redirect path", async () => {
    vi.mocked(inviteLinkIsOpen).mockResolvedValue(false);
    const response = await redeem(form("/api/auth/invite", { token: "../evil?x=1", email: "ana@example.test" }));
    expect(where(response)).toBe(`/invite/${encodeURIComponent("../evil?x=1")}`);
  });
});

describe("public auth POSTs refuse another site", () => {
  const cross = (path: string, fields: Record<string, string>) =>
    new Request(`https://app.example${path}`, { method: "POST", headers: { origin: "https://evil.example" }, body: new URLSearchParams(fields) });

  it("sends nothing when a form on another site posts to redeem or sign in", async () => {
    expect((await redeem(cross("/api/auth/invite", { token: TOKEN, email: "ana@example.test" }))).status).toBe(403);
    expect((await magicLink(cross("/api/auth/magic-link", { email: "ana@example.test" }))).status).toBe(403);
    expect((await confirm(cross("/api/auth/confirm", { token_hash: "h" }))).status).toBe(403);
    expect((await signOut(cross("/api/auth/sign-out", {}))).status).toBe(403);
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("lets anyone signed in, an Invitee included, sign themselves out", async () => {
    const response = await signOut(form("/api/auth/sign-out", {}));
    expect(auth.signOut).toHaveBeenCalled();
    expect(where(response)).toBe("/sign-in");
  });
});

describe("POST /api/auth/magic-link (an Invitee signing in again)", () => {
  it("sends a link to a recorded Invitee without ever creating an account", async () => {
    const response = await magicLink(form("/api/auth/magic-link", { email: "ana@example.test" }));
    expect(where(response)).toBe("/sign-in?sent=1");
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "ana@example.test",
      options: { shouldCreateUser: false },
    });
  });

  it("answers a stranger and a locked-out Invitee exactly like an Invitee, and sends nothing", async () => {
    vi.mocked(isInviteeEmail).mockResolvedValue(false);
    const response = await magicLink(form("/api/auth/magic-link", { email: "stranger@example.test" }));
    expect(where(response)).toBe("/sign-in?sent=1");
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("rejects something that is not an email", async () => {
    const response = await magicLink(form("/api/auth/magic-link", { email: "nope" }));
    expect(where(response)).toBe("/sign-in?error=invalid_email");
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/callback (the magic link lands)", () => {
  const land = (query: string) => callback(new Request(`https://app.example/api/auth/callback?${query}`));

  it("records the person as an Invitee through the link they redeemed and signs them in", async () => {
    const response = await land(`code=abc&invite=${TOKEN}`);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(joinWithInvite).toHaveBeenCalledWith({ userId: USER_ID, email: "ana@example.test", token: TOKEN });
    expect(where(response)).toBe("/welcome");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("signs an existing Invitee straight in", async () => {
    vi.mocked(joinWithInvite).mockResolvedValue("existing");
    expect(where(await land(`code=abc&invite=${TOKEN}`))).toBe("/welcome");
  });

  it("refuses when the link died between the email and the click, and signs the session out", async () => {
    vi.mocked(joinWithInvite).mockResolvedValue("refused");
    vi.mocked(inviteLinkIsOpen).mockResolvedValue(false);
    const response = await land(`code=abc&invite=${TOKEN}`);
    expect(where(response)).toBe(`/invite/${TOKEN}`);
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("refuses a locked-out Invitee on a live link with a sign-in error, not the dead-link page", async () => {
    vi.mocked(joinWithInvite).mockResolvedValue("refused");
    const response = await land(`code=abc&invite=${TOKEN}`);
    expect(where(response)).toBe("/sign-in?error=not_allowed");
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("lets a recorded Invitee back in from the sign-in page, to the page they wanted", async () => {
    const response = await land("code=abc&next=%2Fsettings");
    expect(joinWithInvite).not.toHaveBeenCalled();
    expect(where(response)).toBe("/settings");
  });

  it("refuses someone who is not an Invitee and never creates one without a link", async () => {
    vi.mocked(isActiveInvitee).mockResolvedValue(false);
    const response = await land("code=abc");
    expect(where(response)).toBe("/sign-in?error=not_allowed");
    expect(joinWithInvite).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("lets the Owner through without consulting the Invitee table", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: OWNER_ID, email: "owner@example.test" } }, error: null });
    const response = await land(`code=abc&invite=${TOKEN}`);
    expect(where(response)).toBe("/");
    expect(joinWithInvite).not.toHaveBeenCalled();
    expect(isActiveInvitee).not.toHaveBeenCalled();
  });

  it("sends an expired or missing code back to sign-in", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    expect(where(await land("code=abc"))).toBe("/sign-in?error=link_expired");
    expect(where(await land(""))).toBe("/sign-in?error=link_expired");
  });

  it("does not follow an off-site `next`", async () => {
    expect(where(await land("code=abc&next=https%3A%2F%2Fevil.example"))).toBe("/welcome");
    expect(where(await land("code=abc&next=%2F%2Fevil.example"))).toBe("/welcome");
  });

  it("carries the session cookies the code exchange set", async () => {
    const response = await land("code=abc");
    expect((response as import("next/server").NextResponse).cookies.get("sb-pkce")?.value).toBe("verifier");
  });
});

describe("POST /api/auth/confirm (the Continue button on the emailed link)", () => {
  const press = (fields: Record<string, string>) => confirm(form("/api/auth/confirm", fields));

  it("spends the token, records the Invitee through the link and signs them in", async () => {
    const response = await press({ token_hash: "hash", invite: TOKEN });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash", type: "email" });
    expect(joinWithInvite).toHaveBeenCalledWith({ userId: USER_ID, email: "ana@example.test", token: TOKEN });
    expect(where(response)).toBe("/welcome");
    expect((response as import("next/server").NextResponse).cookies.get("sb-pkce")?.value).toBe("verifier");
  });

  it("joins through the link remembered in the account when the email link carries none (any device)", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: USER_ID, email: "ana@example.test", user_metadata: { invite: TOKEN } } }, error: null });
    expect(where(await press({ token_hash: "hash" }))).toBe("/welcome");
    expect(joinWithInvite).toHaveBeenCalledWith({ userId: USER_ID, email: "ana@example.test", token: TOKEN });
  });

  it("also accepts the code of Supabase's default link", async () => {
    expect(where(await press({ code: "abc", invite: TOKEN }))).toBe("/welcome");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("lets a recorded Invitee back in to the page they wanted", async () => {
    expect(where(await press({ token_hash: "hash", next: "/settings" }))).toBe("/settings");
    expect(joinWithInvite).not.toHaveBeenCalled();
  });

  it("refuses a stranger without a link and signs them out", async () => {
    vi.mocked(isActiveInvitee).mockResolvedValue(false);
    expect(where(await press({ token_hash: "hash" }))).toBe("/sign-in?error=not_allowed");
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("shows the dead-link page when the link died before the button was pressed", async () => {
    vi.mocked(joinWithInvite).mockResolvedValue("refused");
    vi.mocked(inviteLinkIsOpen).mockResolvedValue(false);
    expect(where(await press({ token_hash: "hash", invite: TOKEN }))).toBe(`/invite/${TOKEN}`);
  });

  it("sends a used, expired or missing token back to sign-in", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "One-time token not found" } });
    expect(where(await press({ token_hash: "hash" }))).toBe("/sign-in?error=link_expired");
    expect(where(await press({}))).toBe("/sign-in?error=link_expired");
  });

  it("does not follow an off-site `next`", async () => {
    expect(where(await press({ token_hash: "hash", next: "//evil.example" }))).toBe("/welcome");
  });
});
