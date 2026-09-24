import { describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("./llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("./llm")>();
  return { ...original, anthropic: () => ({ messages: { create } }) };
});

describe("extractSync change marker", () => {
  it("stores an in-vocabulary change and drops an out-of-vocabulary one without dropping the entry", async () => {
    const { extractSync } = await import("./extract");
    const { emptyUsage, EXTRACT_MODEL } = await import("./llm");

    const items = [
      { id: 101, text: "The new owners reopened last month and the food is great.", stars: 5 },
      { id: 102, text: "Lovely dinner as always.", stars: 4 },
    ];
    const analysis = { lang: "en", food: 1, service: null, ambience: null, value: null, wait: null, consistency: null, exceptional: "none" as const, flags: [], themes: [], quote: null, names: [] };
    create.mockResolvedValueOnce({
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [{ type: "text", text: JSON.stringify({ reviews: [
        { i: 101, ...analysis, change: "new_owner" },
        { i: 102, ...analysis, change: "not_a_real_change" },
      ] }) }],
    });

    const usage = emptyUsage("extract", EXTRACT_MODEL, false);
    const result = await extractSync(items, usage, 1);

    expect(result.get(101)?.change).toBe("new_owner");
    expect(result.get(102)?.change).toBe("none");
    expect(result.get(102)?.aspects.food).toBe(1); // the rest of the entry survives the bad field
  });
});
