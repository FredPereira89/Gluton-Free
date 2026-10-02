import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WELCOME_DISMISSED_COOKIE, welcomeDismissedCookie } from "@/domain/welcome";
import { WelcomeCard } from "./welcome-card";

describe("Welcome card (issue #119)", () => {
  it("shows current coverage and offers a way to dismiss", () => {
    const html = renderToStaticMarkup(createElement(WelcomeCard, { restaurantsCount: 330 }));
    expect(html).toContain("Browse 330 Lisbon Restaurants");
    expect(html).toContain("each judged against its own kind");
    expect(html).toContain("Dismiss");
  });

  it("remembers the dismissal for a year, site-wide, readable by the server", () => {
    const cookie = welcomeDismissedCookie();
    expect(cookie).toContain(`${WELCOME_DISMISSED_COOKIE}=1`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("HttpOnly"); // set by the browser on dismiss
  });
});
