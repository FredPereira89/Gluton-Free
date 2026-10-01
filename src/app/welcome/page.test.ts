import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WelcomePage, { metadata } from "./page";

describe("the Invitee welcome page", () => {
  it("is noindex and says the person is in", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(renderToStaticMarkup(WelcomePage())).toContain("You&#x27;re in");
  });
});
