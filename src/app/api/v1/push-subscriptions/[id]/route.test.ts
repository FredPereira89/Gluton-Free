import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";
import { routes } from "@/lib/api-contract";
import { AuthError, requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireOwner: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: vi.fn() }));

const query = vi.fn();

function remove(id: string) {
  return DELETE(new Request(`http://localhost/api/v1/push-subscriptions/${id}`, {
    method: "DELETE",
    headers: { origin: "http://localhost" },
  }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue("11111111-1111-4111-8111-111111111111");
  vi.mocked(db).mockReturnValue(query as unknown as ReturnType<typeof db>);
  query.mockResolvedValue([{ id: "42" }]);
});

describe("DELETE /api/v1/push-subscriptions/:id", () => {
  it("removes the subscription only for the authenticated owner", async () => {
    const response = await remove("42");
    expect(response.status).toBe(200);
    expect(routes.deletePushSubscription.responses[200].parse(await response.json())).toEqual({ deleted: true });
    const [template, ...values] = query.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    expect(template.join("?")).toContain("where id = ? and owner_user_id = ?");
    expect(values).toEqual([42, "11111111-1111-4111-8111-111111111111"]);
  });

  it("returns not found for an unknown or another owner's subscription", async () => {
    query.mockResolvedValueOnce([]);
    const response = await remove("42");
    expect(response.status).toBe(404);
    expect(routes.deletePushSubscription.responses[404].parse(await response.json()).code).toBe("not_found");
  });

  it("rejects invalid ids and unauthenticated requests", async () => {
    const invalid = await remove("0");
    expect(invalid.status).toBe(400);
    expect(routes.deletePushSubscription.responses[400].parse(await invalid.json()).code).toBe("invalid_request");
    expect(query).not.toHaveBeenCalled();

    vi.mocked(requireOwner).mockRejectedValueOnce(new AuthError(401, "unauthenticated", "No session"));
    const unauthorized = await remove("42");
    expect(unauthorized.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});
