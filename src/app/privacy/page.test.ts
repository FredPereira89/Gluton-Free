import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage, { metadata } from "./page";

describe("public privacy notice", () => {
  it("is noindex and explains Invitee data, its use and deletion", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });

    const html = renderToStaticMarkup(PrivacyPage());

    expect(html).toContain("email address");
    expect(html).toContain("feedback");
    expect(html).toContain("First-party usage events");
    expect(html).toContain("delete your data");
  });
});
