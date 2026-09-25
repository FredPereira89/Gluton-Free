import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HomePage from "./page";
import { loadActivity } from "@/web/data";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/web/data", () => ({ loadActivity: vi.fn() }));
vi.mock("./search-home", () => ({ default: () => null }));

const emptyActivity = { running: [], ready: [], questions: [] };

describe("Home Activity list (issue #52)", () => {
  it("lists Running, Ready (new) and Needs you Restaurants, each linking to its Verdict page", async () => {
    vi.mocked(loadActivity).mockResolvedValue({
      running: [{ slug: "running-one", name: "Running One", jobKind: "lookup", status: "running", step: "Fetching Reviews" }],
      ready: [{ slug: "ready-one", name: "Ready One", verdictId: 7, tier: "good", provisional: false }],
      questions: [{ slug: "asking-one", name: "Asking One", count: 2 }],
    });
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Running");
    expect(html).toContain('href="/r/running-one"');
    expect(html).toContain("Fetching Reviews");
    expect(html).toContain("Ready (new)");
    expect(html).toContain('href="/r/ready-one"');
    expect(html).toContain("Good");
    expect(html).toContain("Needs you");
    expect(html).toContain('href="/r/asking-one"');
    expect(html).toContain("Asking One");
  });

  it("omits a group's heading entirely when it has no items", async () => {
    vi.mocked(loadActivity).mockResolvedValue(emptyActivity);
    const html = renderToStaticMarkup(await HomePage());
    expect(html).not.toContain("Running");
    expect(html).not.toContain("Ready (new)");
    expect(html).not.toContain("Needs you");
  });
});
