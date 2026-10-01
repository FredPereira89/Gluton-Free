import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("./llm", async (importOriginal) => ({
  ...await importOriginal<typeof import("./llm")>(),
  anthropic: () => ({ messages: { create: state.create } }),
}));

import { extractDishDietarySync } from "./dish-dietary";
import { emptyUsage, EXTRACT_MODEL } from "./llm";

describe("dish and dietary extraction", () => {
  beforeEach(() => {
    state.create.mockReset().mockResolvedValue({
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [{ type: "text", text: JSON.stringify({ reviews: [{ i: 1, dishes: [], praise: [], complaints: [] }] }) }],
    });
  });

  it("sends the full Review text to the pass", async () => {
    const reviewText = "x".repeat(2_000);
    await extractDishDietarySync([{ id: 1, text: reviewText }], emptyUsage("dish-dietary", EXTRACT_MODEL, false));

    const request = state.create.mock.calls[0]![0] as { messages: { content: string }[] };
    expect(JSON.parse(request.messages[0]!.content).reviews[0].text).toBe(reviewText);
  });
});
