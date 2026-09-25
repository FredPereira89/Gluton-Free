import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "./route";
import { routes } from "@/lib/api-contract";
import { AuthError, requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireOwner: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: vi.fn() }));

const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue("11111111-1111-4111-8111-111111111111");
  vi.mocked(db).mockReturnValue(query as unknown as ReturnType<typeof db>);
  query.mockResolvedValue([{ id: "1" }]);
});

function put(slug: string, body: unknown) {
  return PUT(
    new Request(`http://localhost/api/v1/restaurants/${slug}/seen`, {
      method: "PUT", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

describe("PUT /api/v1/restaurants/:slug/seen", () => {
  it("marks a Verdict seen, updating the row keyed on the slug and verdictId", async () => {
    const response = await put("sample", { verdictId: 7 });
    expect(response.status).toBe(200);
    expect(routes.markSeen.responses[200].parse(await response.json())).toEqual({ seen: true });
    const [template, ...values] = query.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    expect(template.join(" ")).toContain("set seen_verdict_id");
    expect(values).toEqual([7, "sample", 7]);
  });

  it("404s when the Restaurant or the Verdict does not match", async () => {
    query.mockResolvedValueOnce([]);
    const response = await put("sample", { verdictId: 7 });
    expect(response.status).toBe(404);
    expect(routes.markSeen.responses[404].parse(await response.json()).code).toBe("not_found");
  });

  it("rejects a missing or invalid verdictId before touching the database", async () => {
    const missing = await put("sample", {});
    expect(missing.status).toBe(400);
    const negative = await put("sample", { verdictId: -1 });
    expect(negative.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("requires the owner", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new AuthError(401, "unauthenticated", "No session"));
    const response = await put("sample", { verdictId: 7 });
    expect(response.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});
