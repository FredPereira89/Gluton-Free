import { describe, expect, it } from "vitest";
import { config } from "./proxy";

// Next runs the proxy only for paths the matcher accepts; a path it rejects is public.
const proxied = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

describe("which paths the auth gate covers", () => {
  it("leaves Invite link redemption, sign-in and the magic-link routes public", () => {
    for (const path of [
      "/sign-in", "/invite/" + "A".repeat(43), "/api/auth/invite", "/api/auth/magic-link", "/api/auth/callback", "/auth/confirm", "/api/auth/confirm", "/api/auth/sign-in", "/api/v1/health",
    ]) expect(proxied(path), path).toBe(false);
  });

  it("still gates pages, sign-out and the admin routes, including ones that look similar", () => {
    for (const path of [
      "/", "/settings", "/api/auth/sign-out", "/api/v1/invite-links", "/api/v1/invitees", "/invites",
    ]) expect(proxied(path), path).toBe(true);
  });
});
