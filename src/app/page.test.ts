import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage, { metadata } from "./page";
import { AuthError, requireCaller } from "@/lib/auth";

const { mockSearchHome } = vi.hoisted(() => ({ mockSearchHome: vi.fn() }));

vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth")>(),
  requireCaller: vi.fn(),
}));
vi.mock("./search-home", () => ({
  default: (props: { canAddRestaurant: boolean }) => mockSearchHome(props),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchHome.mockReturnValue(createElement("div", null, "Signed-in app"));
});

describe("home page", () => {
  it("shows a static, fictional landing page to signed-out visitors", async () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    vi.mocked(requireCaller).mockRejectedValue(new AuthError(401, "unauthenticated", "No session"));

    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Lisbon only");
    expect(html).toContain("judged against others of its own kind");
    expect(html).toContain("Invitation-only beta");
    expect(html).toContain("Fictional example");
    expect(html).toContain("Casa Imaginária");
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('href="/privacy"');
    expect(mockSearchHome).not.toHaveBeenCalled();
  });

  it("shows the existing app at / to an Owner", async () => {
    vi.mocked(requireCaller).mockResolvedValue({ userId: "owner", role: "owner" });

    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Signed-in app");
    expect(mockSearchHome).toHaveBeenCalledWith({ canAddRestaurant: true });
  });

  it("shows the existing app at / to an Invitee without Owner controls", async () => {
    vi.mocked(requireCaller).mockResolvedValue({ userId: "invitee", role: "invitee" });

    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Signed-in app");
    expect(mockSearchHome).toHaveBeenCalledWith({ canAddRestaurant: false });
  });
});
