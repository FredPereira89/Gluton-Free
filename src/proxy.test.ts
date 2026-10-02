import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

// Next runs the proxy only for paths the matcher accepts; a path it rejects is public.
const proxied = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

describe("which paths the auth gate covers", () => {
  it("leaves Invite link redemption, sign-in and the magic-link routes public", () => {
    for (const path of [
      "/sign-in", "/welcome", "/invite/" + "A".repeat(43), "/api/auth/invite", "/api/auth/magic-link", "/api/auth/callback", "/auth/confirm", "/api/auth/confirm", "/api/auth/sign-out", "/api/auth/sign-in", "/api/v1/health", "/logo-mark.png", "/icon.png", "/apple-touch-icon.png",
    ]) expect(proxied(path), path).toBe(false);
  });

  it("matches pages, sign-out and the admin routes so the proxy can enforce their auth level", () => {
    for (const path of [
      "/settings", "/api/v1/invite-links", "/api/v1/invitees", "/invites",
    ]) expect(proxied(path), path).toBe(true);
  });

  it("lets the landing page and privacy notice render publicly", async () => {
    for (const path of ["/", "/privacy", "/privacy/"]) {
      const response = await proxy(new NextRequest(`https://app.example${path}`));
      expect(response.headers.get("x-middleware-next"), path).toBe("1");
    }
  });
});
