import { describe, expect, it } from "vitest";
import { rollup } from "@/verdict/rollup";
import { inviteeBundleSchema, type RestaurantBundle } from "./api-contract";
import { projectInviteeBundle } from "./invitee-projection";

const NOW = new Date("2026-09-24T12:00:00.000Z");
const PERSONAL_QUOTE = "SCRUBBED personal-only quote text";
const PERSONAL_TRANSLATION = "SCRUBBED personal-only translation";
const PUBLIC_QUOTE = "SCRUBBED public-OK quote text";
const PERSONAL_EVIDENCE = "SCRUBBED personal-only incident evidence";
const PUBLIC_EVIDENCE = "SCRUBBED public-OK incident evidence";

const source = (code: string, name: string, access: "public_ok" | "personal_only") => ({
  code, name, kind: "crowd" as const, access, matchProvenance: "auto_accepted" as const, url: `https://${code}.example/place`,
  rating: 4.5, reviewCount: 9, textCount: 4, newestAt: null, fetchStatus: "fetched" as const,
});
const quote = (reviewId: number, text: string, textEn: string | null, sourceCode: string, access?: "public_ok" | "personal_only") => ({
  reviewId, aspect: "food" as const, polarity: 1 as const, text, textEn, lang: "pt", stars: 5, source: sourceCode, month: "2026-08", ...(access ? { access } : {}),
});
const incident = (reviewId: number, evidence: string, sourceCode: string) => ({
  reviewId, type: "hygiene" as const, evidence, source: sourceCode, publishedAt: "2026-08-10T00:00:00.000Z", stars: 1,
});

function ownerBundle(): RestaurantBundle {
  return {
    restaurant: { id: 1, slug: "o-velho-eurico", name: "O Velho Eurico", city: "Lisbon", area: "Mouraria", format: "tasca", formatProvenance: "llm", priceTier: "€€" },
    verdict: {
      id: 7, state: "verdict", tier: "good", confidence: "medium", explanation: "Reads well.", issuedAt: "2026-09-24T12:00:00.000Z", provisional: true,
      blocks: {
        rollup: {
          ...rollup({ now: NOW, format: "tasca", reviews: [], flags: [] }),
          redFlags: [{
            group: "health", incidents12m: 2, newestAt: "2026-08-10T00:00:00.000Z", shareOfText12m: 0.1, forcesAvoid: false, types: ["hygiene"],
            incidents: [incident(11, PERSONAL_EVIDENCE, "google"), incident(12, PUBLIC_EVIDENCE, "tripadvisor")],
          }],
        },
        quotes: [
          quote(21, PERSONAL_QUOTE, PERSONAL_TRANSLATION, "google", "personal_only"),
          quote(22, PUBLIC_QUOTE, null, "tripadvisor", "public_ok"),
          quote(23, `${PERSONAL_QUOTE} two`, null, "google"),
          quote(24, `${PERSONAL_QUOTE} three`, null, "gone", "public_ok"),
        ],
      },
    },
    sources: [source("google", "Google", "personal_only"), source("tripadvisor", "Tripadvisor", "public_ok")],
    distinctions: [{ id: 1, guide: "Michelin", level: "Bib Gourmand", editionYear: 2026, url: "https://guide.example/1" }],
    critics: [{ id: 2, publication: "Time Out", title: "Eurico", url: "https://critic.example/2", publishedOn: "2026-05-01", language: "pt", printedRating: null }],
    series: [{ quarter: "2026-Q3", composite: 0.4, volume: 9, textVolume: 4 }],
    changePoints: [{ id: 3, occurredOn: "2026-02-01", description: "New chef" }],
    activeJob: { id: 5, kind: "refresh", status: "running", step: "reading", createdAt: "2026-09-24T11:00:00.000Z" },
    ownerQuestions: [{ id: 6, kind: "retry_source", source: "google", prompt: "Retry Google?" }],
    unavailableSources: [{ source: "thefork", detail: "TheFork matching could not run" }],
  };
}

describe("projectInviteeBundle", () => {
  it("returns only what the Invitee shape allows: no Sources table, Owner questions, active job, unavailable Sources or proposed marker", () => {
    const projected = projectInviteeBundle(ownerBundle());
    expect(inviteeBundleSchema.parse(projected)).toEqual(projected);
    for (const key of ["sources", "ownerQuestions", "activeJob", "unavailableSources"]) expect(projected, key).not.toHaveProperty(key);
    expect(projected.restaurant).not.toHaveProperty("formatProvenance");
    expect(projected.restaurant).toMatchObject({ slug: "o-velho-eurico", name: "O Velho Eurico", format: "tasca" });
  });

  it("carries no Review text from a personal-only Source: no quote, no translation, no incident evidence", () => {
    const json = JSON.stringify(projectInviteeBundle(ownerBundle()));
    expect(json).not.toContain("SCRUBBED personal-only");
  });

  it("fails closed: a quote is kept only when its Source is recorded as public-OK, whatever the quote itself claims", () => {
    const { verdict } = projectInviteeBundle(ownerBundle());
    expect(verdict!.blocks.quotes.map((q) => q.reviewId)).toEqual([22]);
    expect(verdict!.blocks.quotes[0]).toMatchObject({ text: PUBLIC_QUOTE, access: "public_ok" });
  });

  it("keeps a red flag's counts and public-OK evidence, and names Sources so incidents can be attributed", () => {
    const projected = projectInviteeBundle(ownerBundle());
    const flag = projected.verdict!.blocks.rollup.redFlags[0]!;
    expect(flag).toMatchObject({ group: "health", incidents12m: 2, forcesAvoid: false, types: ["hygiene"] });
    expect(flag.incidents).toEqual([
      { reviewId: 11, type: "hygiene", source: "google", publishedAt: "2026-08-10T00:00:00.000Z", stars: 1 },
      { reviewId: 12, type: "hygiene", source: "tripadvisor", publishedAt: "2026-08-10T00:00:00.000Z", stars: 1, evidence: PUBLIC_EVIDENCE },
    ]);
    expect(projected.sourceNames).toEqual({ google: "Google", tripadvisor: "Tripadvisor" });
  });

  it("leaves the read-only facts in place and the Owner's bundle untouched", () => {
    const bundle = ownerBundle();
    const before = structuredClone(bundle);
    const projected = projectInviteeBundle(bundle);
    expect(bundle).toEqual(before);
    expect(projected.verdict).toMatchObject({ id: 7, tier: "good", explanation: "Reads well." });
    expect(projected.distinctions).toEqual(bundle.distinctions);
    expect(projected.critics).toEqual(bundle.critics);
    expect(projected.series).toEqual(bundle.series);
    expect(projected.changePoints).toEqual(bundle.changePoints);
  });

  it("projects a Restaurant with no Verdict yet", () => {
    const projected = projectInviteeBundle({ ...ownerBundle(), verdict: null });
    expect(projected.verdict).toBeNull();
    expect(inviteeBundleSchema.parse(projected)).toEqual(projected);
  });
});
