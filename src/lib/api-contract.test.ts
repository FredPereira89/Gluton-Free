import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import VerdictPageRoute from "@/app/r/[slug]/page";
import { GET as health } from "@/app/api/v1/health/route";
import { GET as openApi } from "@/app/openapi.json/route";
import { GET as verdict } from "@/app/api/v1/restaurants/[slug]/verdict/route";
import { GET as restaurantBundle } from "@/app/api/v1/restaurants/[slug]/route";
import { rollup } from "@/verdict/rollup";
import { loadRestaurantBundle, loadVerdictPage, type VerdictPage } from "@/web/data";
import { acceptedJobResponse, acceptedJobSchema, paginatedSchema, parsePagination, routes, type RestaurantBundle } from "./api-contract";
import { problemSchema } from "./problem";

vi.mock("@/web/data", () => ({ loadVerdictPage: vi.fn(), loadRestaurantBundle: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));

const fixture: VerdictPage = {
  restaurant: { id: 1, slug: "o-velho-eurico", name: "O Velho Eurico", city: "Lisbon", area: "Mouraria", format: "tasca", priceTier: null },
  sources: [{ code: "google", name: "Google", kind: "crowd", access: "personal_only", url: "https://maps.google.com/", rating: 4.5, reviewCount: 5, textCount: 2, newestAt: null, fetchStatus: "ok" }],
  verdict: {
    id: 1, state: "not_enough_evidence", tier: null, confidence: "low", explanation: "More Reviews needed.",
    createdAt: new Date("2026-09-24T12:00:00.000Z"),
    blocks: { rollup: rollup({ now: new Date("2026-09-24T12:00:00.000Z"), format: "tasca", reviews: [], flags: [] }), quotes: [] },
  },
  distinctions: [],
  critics: [],
};

const bundleFixture: RestaurantBundle = {
  restaurant: fixture.restaurant as RestaurantBundle["restaurant"],
  verdict: {
    id: 1, state: "not_enough_evidence", tier: null, confidence: "low", explanation: "More Reviews needed.",
    issuedAt: "2026-09-24T12:00:00.000Z", provisional: true, blocks: fixture.verdict!.blocks,
  },
  sources: [{ code: "google", name: "Google", kind: "crowd", access: "personal_only", url: "https://maps.google.com/", rating: 4.5, reviewCount: 5, textCount: 2, newestAt: null, fetchStatus: "fetched" }],
  distinctions: [], critics: [], series: [], changePoints: [], activeJob: null, ownerQuestions: [],
};

describe("API registry and OpenAPI", () => {
  it("declares owner authorization for every route except the data-free health check", () => {
    expect(Object.values(routes).filter((route) => route.auth !== "owner").map((route) => route.path)).toEqual(["/api/v1/health"]);
  });

  it("registers every /api/v1 handler method", () => {
    const files = readdirSync(new URL("../app/api/v1/", import.meta.url), { recursive: true })
      .map(String).filter((file) => file.endsWith("route.ts"));
    const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
    const registered = files.flatMap((file) => {
      const path = `/api/v1/${file.replaceAll("\\", "/").replace(/\/route\.ts$/, "").replace(/\[([^\]]+)\]/g, "{$1}")}`;
      const content = readFileSync(new URL(`../app/api/v1/${file.replaceAll("\\", "/")}`, import.meta.url), "utf8");
      const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
      const names: string[] = [];
      for (const node of source.statements) {
        if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
          names.push(...node.exportClause.elements.map((element) => element.name.text));
        }
        const exported = ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
        if (!exported) continue;
        if (ts.isFunctionDeclaration(node) && node.name) names.push(node.name.text);
        if (ts.isVariableStatement(node)) {
          names.push(...node.declarationList.declarations.filter((declaration) => ts.isIdentifier(declaration.name)).map((declaration) => declaration.name.getText(source)));
        }
      }
      return names.filter((name) => methods.has(name)).map((name) => `${name} ${path}`);
    });
    expect(registered.sort()).toEqual(Object.values(routes).map((route) => `${route.method} ${route.path}`).sort());
  });

  it("serves the checked-in OpenAPI 3.1 document", async () => {
    const response = await openApi();
    expect(response.status).toBe(200);
    const document = await response.json();
    expect(document).toEqual(JSON.parse(readFileSync(new URL("../../openapi.json", import.meta.url), "utf8")));
    expect(document.openapi).toBe("3.1.0");
  });

  it("excludes forbidden response field names throughout openapi.json", () => {
    const document = JSON.parse(readFileSync(new URL("../../openapi.json", import.meta.url), "utf8"));
    const forbidden = /^(?:reviewer|author|profile|raw|ownerResponse)|^(?:avatar|permalink|sourceReviewId)$/i;
    const names: string[] = [];
    const openObjects: string[] = [];
    function walk(value: unknown): void {
      if (!value || typeof value !== "object") return;
      const object = value as Record<string, unknown>;
      if (object.properties && typeof object.properties === "object") {
        names.push(...Object.keys(object.properties));
        if (object.additionalProperties !== false) openObjects.push(Object.keys(object.properties).join(","));
      }
      Object.values(object).forEach(walk);
    }
    walk(document);
    expect(names.filter((name) => forbidden.test(name))).toEqual([]);
    expect(openObjects).toEqual([]);
  });
});

describe("handler responses", () => {
  it("renders the Verdict page from the bundle's Restaurant and Source data", async () => {
    vi.mocked(loadRestaurantBundle).mockResolvedValueOnce({
      ...bundleFixture,
      activeJob: { id: 7, kind: "lookup", status: "running", step: "reading Sources", createdAt: "2026-09-24T12:00:00.000Z" },
    });
    const markup = renderToStaticMarkup(await VerdictPageRoute({ params: Promise.resolve({ slug: "o-velho-eurico" }) }));
    expect(markup).toContain("O Velho Eurico");
    expect(markup).toContain("Google");
    expect(markup).toContain("personal-only");
    expect(markup).toContain("4.5");
    expect(markup).toContain("fetched");
    expect(markup).toContain("Not enough evidence");
    expect(markup).toContain("Current lookup job: running");
  });

  it("serves a strict Restaurant bundle with private conditional caching", async () => {
    vi.mocked(loadRestaurantBundle).mockResolvedValue(bundleFixture);
    const url = "https://app.example/api/v1/restaurants/o-velho-eurico";
    const response = await restaurantBundle(new Request(url), { params: Promise.resolve({ slug: "o-velho-eurico" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    const body = routes.restaurantBundle.responses[200].parse(await response.json());
    expect(body.restaurant.name).toBe("O Velho Eurico");
    expect(body.sources[0]).toMatchObject({ reviewCount: 5, textCount: 2, rating: 4.5 });
    expect(body.verdict?.blocks.rollup.state).toBe("not_enough_evidence");
    expect(() => routes.restaurantBundle.responses[200].parse({ ...body, reviewerName: "someone" })).toThrow();
    const etag = response.headers.get("etag");
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    const repeated = await restaurantBundle(new Request(url, { headers: { "If-None-Match": etag! } }), { params: Promise.resolve({ slug: "o-velho-eurico" }) });
    expect(repeated.status).toBe(304);
    expect(repeated.headers.get("etag")).toBe(etag);
    expect(repeated.headers.get("cache-control")).toBe("private, no-cache");
    expect(await repeated.text()).toBe("");
  });

  it("returns a not_found problem for an unknown Restaurant slug", async () => {
    vi.mocked(loadRestaurantBundle).mockResolvedValueOnce(null);
    const response = await restaurantBundle(new Request("https://app.example/api/v1/restaurants/missing"), { params: Promise.resolve({ slug: "missing" }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(routes.restaurantBundle.responses[404].parse(await response.json()).code).toBe("not_found");
  });

  it("parses health through its declared response schema", async () => {
    const response = await health();
    expect(response.status).toBe(200);
    expect(routes.health.responses[200].parse(await response.json())).toEqual({ status: "ok" });
  });

  it("parses a Verdict through its declared response schema", async () => {
    vi.mocked(loadVerdictPage).mockResolvedValueOnce(fixture);
    const response = await verdict(new Request("https://app.example/api/v1/restaurants/o-velho-eurico/verdict"), { params: Promise.resolve({ slug: "o-velho-eurico" }) });
    expect(response.status).toBe(200);
    const body = routes.verdict.responses[200].parse(await response.json());
    expect(body.restaurant.name).toBe("O Velho Eurico");
    expect(body.verdict?.issuedAt).toBe("2026-09-24T12:00:00.000Z");
    expect(() => routes.verdict.responses[200].parse({ ...body, reviewerName: "someone" })).toThrow();
  });

  it("returns a declared RFC 9457 problem when the Restaurant is absent", async () => {
    vi.mocked(loadVerdictPage).mockResolvedValueOnce(null);
    const response = await verdict(new Request("https://app.example/api/v1/restaurants/missing/verdict"), { params: Promise.resolve({ slug: "missing" }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    const body = routes.verdict.responses[404].parse(await response.json());
    expect(body).toMatchObject({ status: 404, code: "not_found", detail: "Restaurant not found" });
    expect(problemSchema.parse(body)).toEqual(body);
  });

  it("returns declared problems for invalid requests and handler failures", async () => {
    const request = new Request("https://app.example/api/v1/restaurants/x/verdict");
    const invalid = await verdict(request, { params: Promise.resolve({ slug: "" }) });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("content-type")).toBe("application/problem+json");
    expect(routes.verdict.responses[400].parse(await invalid.json()).code).toBe("invalid_request");

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.mocked(loadVerdictPage).mockRejectedValueOnce(new Error("database secret"));
      const failed = await verdict(request, { params: Promise.resolve({ slug: "x" }) });
      expect(failed.status).toBe(500);
      expect(failed.headers.get("content-type")).toBe("application/problem+json");
      const body = routes.verdict.responses[500].parse(await failed.json());
      expect(body.code).toBe("internal_error");
      expect(body.detail).not.toContain("database secret");
    } finally {
      log.mockRestore();
    }
  });
});

describe("shared API conventions", () => {
  it("returns a pollable job with the required headers", async () => {
    const response = acceptedJobResponse(42);
    expect(response.status).toBe(202);
    expect(response.headers.get("location")).toBe("/api/v1/jobs/42");
    expect(response.headers.get("retry-after")).toBe("5");
    expect(acceptedJobSchema.parse(await response.json())).toEqual({ id: 42 });
  });

  it("parses cursor and limit and wraps a page", () => {
    expect(parsePagination(new URLSearchParams("cursor=abc&limit=5"))).toEqual({ cursor: "abc", limit: 5 });
    expect(parsePagination(new URLSearchParams()).limit).toBe(20);
    expect(() => parsePagination(new URLSearchParams("limit=0"))).toThrow();
    expect(paginatedSchema(acceptedJobSchema).parse({ items: [{ id: 1 }], nextCursor: "next" })).toEqual({ items: [{ id: 1 }], nextCursor: "next" });
  });
});
