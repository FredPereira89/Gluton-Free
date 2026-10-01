import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvitePage, { metadata } from "./page";
import { inviteLinkIsOpen } from "@/lib/invite";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/invite", () => ({ inviteLinkIsOpen: vi.fn() }));

const TOKEN = "A".repeat(43);
const render = async (searchParams: { sent?: string; error?: string } = {}, token = TOKEN) =>
  renderToStaticMarkup(await InvitePage({ params: Promise.resolve({ token }), searchParams: Promise.resolve(searchParams) }));

beforeEach(() => vi.mocked(inviteLinkIsOpen).mockResolvedValue(true));

describe("the Invite link page", () => {
  it("is noindex", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("asks a live link's visitor for an email, carrying the token to the redeem route", async () => {
    const html = await render();
    expect(html).toContain('action="/api/auth/invite"');
    expect(html).toContain(`name="token" value="${TOKEN}"`);
    expect(html).toContain('type="email"');
  });

  it("says a revoked, exhausted or unknown link no longer works, with no form", async () => {
    vi.mocked(inviteLinkIsOpen).mockResolvedValue(false);
    const html = await render();
    expect(html).toContain("This link no longer works");
    expect(html).not.toContain("<form");
  });

  it("treats a malformed token like a dead link", async () => {
    vi.mocked(inviteLinkIsOpen).mockResolvedValue(false);
    expect(await render({}, "../x")).toContain("This link no longer works");
  });

  it("confirms the email was sent and shows form errors", async () => {
    expect(await render({ sent: "1" })).toContain("Check your email");
    expect(await render({ error: "invalid_email" })).toContain("doesn&#x27;t look like an email");
    expect(await render({ error: "<script>" })).not.toContain("<script>");
  });
});
