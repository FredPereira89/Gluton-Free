import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SignInPage, { metadata } from "./page";

describe("sign-in page", () => {
  it("links to the public privacy notice", async () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('href="/privacy"');
    expect(html).toContain("privacy notice");
  });
});
