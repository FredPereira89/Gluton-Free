import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ConfirmPage, { metadata } from "./page";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));

const render = async (searchParams: { token_hash?: string; invite?: string; next?: string }) =>
  renderToStaticMarkup(await ConfirmPage({ searchParams: Promise.resolve(searchParams) }));

describe("the emailed-link landing page", () => {
  it("is noindex", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("only shows a Continue button that posts the token; opening the page spends nothing", async () => {
    const html = await render({ token_hash: "hash", invite: "tok", next: "/settings" });
    expect(html).toContain('action="/api/auth/confirm"');
    expect(html).toContain('name="token_hash" value="hash"');
    expect(html).toContain('name="invite" value="tok"');
    expect(html).toContain('name="next" value="/settings"');
    expect(html).toContain("Continue");
  });

  it("says the link is incomplete when there is no token, with no form", async () => {
    const html = await render({});
    expect(html).toContain("This link is incomplete");
    expect(html).not.toContain("<form");
  });
});
