import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage, { metadata } from "./page";
import { AuthError, requireCaller } from "@/lib/auth";
import { WELCOME_DISMISSED_COOKIE } from "@/domain/welcome";

const { mockSearchHome, mockDirectory, mockLoadDirectory } = vi.hoisted(() => ({ mockSearchHome: vi.fn(), mockDirectory: vi.fn(), mockLoadDirectory: vi.fn() }));

const { mockCookieGet } = vi.hoisted(() => ({ mockCookieGet: vi.fn() }));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({ get: mockCookieGet }),
}));
vi.mock("@/web/welcome-card", () => ({ WelcomeCard: () => createElement("aside", null, "Welcome card") }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth")>(),
  requireCaller: vi.fn(),
}));
vi.mock("./search-home", () => ({
  default: (props: { canAddRestaurant: boolean; initialQuery: string }) => mockSearchHome(props),
}));
vi.mock("./directory", () => ({ default: (props: unknown) => mockDirectory(props) }));
vi.mock("@/web/data", () => ({ loadDirectory: mockLoadDirectory }));

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchHome.mockReturnValue(createElement("div", null, "Signed-in app"));
  mockDirectory.mockReturnValue(createElement("div", null, "Directory"));
  mockLoadDirectory.mockResolvedValue({ items: [], total: 0 });
  mockCookieGet.mockReturnValue(undefined);
});

describe("home page", () => {
  it("shows a static, fictional landing page to signed-out visitors", async () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    vi.mocked(requireCaller).mockRejectedValue(new AuthError(401, "unauthenticated", "No session"));

    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Lisbon only");
    expect(html).toContain("A Lisbon Restaurant Verdict guide.");
    expect(html).toContain("judged against others of their own kind");
    expect(html).toContain("Original illustration. It does not show any listed Restaurant.");
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
    expect(mockSearchHome).toHaveBeenCalledWith({ canAddRestaurant: true, initialQuery: "", trackUsage: false });
  });

  it("shows the existing app at / to an Invitee without Owner controls", async () => {
    vi.mocked(requireCaller).mockResolvedValue({ userId: "invitee", role: "invitee" });

    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Signed-in app");
    expect(mockSearchHome).toHaveBeenCalledWith({ canAddRestaurant: false, initialQuery: "", trackUsage: true });
  });

  it("shows the directory under the search bar to an Invitee, as read from the URL", async () => {
    vi.mocked(requireCaller).mockResolvedValue({ userId: "invitee", role: "invitee" });

    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ q: "tasca", sort: "value", tier: ["good", "must_go"], nee: "1" }) }));

    expect(html).toContain("Directory");
    expect(mockLoadDirectory).toHaveBeenCalledWith(expect.objectContaining({ q: "tasca", sort: "value", tier: ["good", "must_go"], nee: true, page: 1 }));
    expect(mockSearchHome).toHaveBeenCalledWith({ canAddRestaurant: false, initialQuery: "tasca", trackUsage: true });
    expect(mockDirectory).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ q: "tasca" }) }));
  });

  it("falls back to the default view for a URL that does not parse", async () => {
    vi.mocked(requireCaller).mockResolvedValue({ userId: "owner", role: "owner" });

    await HomePage({ searchParams: Promise.resolve({ sort: "vibes", page: "0" }) });

    expect(mockLoadDirectory).toHaveBeenCalledWith(expect.objectContaining({ sort: "tier", page: 1 }));
  });

  it("does not load the directory for signed-out visitors", async () => {
    vi.mocked(requireCaller).mockRejectedValue(new AuthError(401, "unauthenticated", "No session"));

    await HomePage();

    expect(mockLoadDirectory).not.toHaveBeenCalled();
  });

  it("welcomes a first-time signed-in visitor, Owner or Invitee, and not once dismissed", async () => {
    for (const role of ["owner", "invitee"] as const) {
      vi.mocked(requireCaller).mockResolvedValue({ userId: role, role });
      mockCookieGet.mockReturnValue(undefined);
      expect(renderToStaticMarkup(await HomePage())).toContain("Welcome card");
      mockCookieGet.mockReturnValue({ name: WELCOME_DISMISSED_COOKIE, value: "1" });
      expect(renderToStaticMarkup(await HomePage())).not.toContain("Welcome card");
      expect(mockCookieGet).toHaveBeenLastCalledWith(WELCOME_DISMISSED_COOKIE);
    }
  });

  it("does not show the welcome card to signed-out visitors", async () => {
    vi.mocked(requireCaller).mockRejectedValue(new AuthError(401, "unauthenticated", "No session"));
    expect(renderToStaticMarkup(await HomePage())).not.toContain("Welcome card");
  });
});
