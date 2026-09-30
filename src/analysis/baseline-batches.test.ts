import { describe, expect, it, vi } from "vitest";
import { BaselineSpendBudget } from "@/pipeline/baseline-budget";
import type { BaselineFormatInput } from "@/pipeline/baseline-build";

const create = vi.fn();
const retrieve = vi.fn();
const results = vi.fn();

vi.mock("./llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("./llm")>();
  return { ...original, anthropic: () => ({ messages: { batches: { create, retrieve, results } } }) };
});

const reviewBase = {
  stars: 4, publishedAt: new Date("2026-09-01T00:00:00Z"), language: "pt", subRatings: null,
  reviewerReviewCount: null, localGuide: null, reviewerContributions: null, photoCount: null, visitedOn: null, ownerReplied: false,
};

describe("confirmBaselineFormatsBatch", () => {
  it("skips rating-only Reviews (null text) when sampling a Restaurant's Reviews", async () => {
    const { confirmBaselineFormatsBatch } = await import("./baseline-batches");
    create.mockResolvedValueOnce({ id: "batch_1" });
    retrieve.mockResolvedValueOnce({ processing_status: "ended" });
    results.mockResolvedValueOnce((async function* () {
      yield {
        custom_id: "p0",
        result: {
          type: "succeeded",
          message: {
            usage: { input_tokens: 10, output_tokens: 5 },
            content: [{ type: "text", text: JSON.stringify({ formats: [{ i: 0, format: "tasca" }] }) }],
          },
        },
      };
    })());
    const restaurants: BaselineFormatInput[] = [{
      candidate: { placeId: "place-1" } as BaselineFormatInput["candidate"],
      reviews: [
        { ...reviewBase, sourceReviewId: "r1", text: null },
        { ...reviewBase, sourceReviewId: "r2", text: "Petiscos simples e bons." },
      ],
    }];

    const { formats } = await confirmBaselineFormatsBatch(restaurants, new BaselineSpendBudget(), { sleep: async () => {} });

    const content = create.mock.calls[0]![0].requests[0].params.messages[0].content as string;
    expect(content).toContain("Petiscos simples e bons.");
    expect(content.match(/<review>/g)).toHaveLength(1);
    expect(formats.get("place-1")).toBe("tasca");
  });
});
