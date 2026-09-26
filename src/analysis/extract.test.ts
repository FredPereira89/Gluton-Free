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

  it("keeps explicit renovation evidence when a crowded batch returns none, without treating nearby roadworks as a Restaurant change", async () => {
    const { extractSync } = await import("./extract");
    const { emptyUsage, EXTRACT_MODEL } = await import("./llm");
    const items = [
      { id: 201, text: "O restaurante cancelou-nos a reserva devido a obras.", stars: 1 },
      { id: 202, text: "A reserva foi cancelada devido a obras no restaurante.", stars: 1 },
      { id: 203, text: "They just renovated the restaurant and it looks wonderful.", stars: 5 },
      { id: 204, text: "Roadworks near the restaurant made parking hard.", stars: 2 },
      { id: 205, text: "The restaurant works well for a quick lunch.", stars: 4 },
      { id: 206, text: "Gostei deste restaurante. O hotel cancelou a reserva devido a obras.", stars: 4 },
      { id: 207, text: "O Velho Eurico cancelou-nos a reserva devido a obras, tendo sido feita a desmarcação a pedido do restaurante.", stars: 1 },
    ];
    const analysis = { lang: "en", food: null, service: null, ambience: null, value: null,
      wait: null, consistency: null, exceptional: "none", change: "none", flags: [], themes: [], quote: null, names: [] };
    create.mockResolvedValueOnce({
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [{ type: "text", text: JSON.stringify({ reviews: items.map((item) => ({ i: item.id, ...analysis })) }) }],
    });
    const result = await extractSync(items, emptyUsage("extract", EXTRACT_MODEL, false), 1);
    expect(items.map((item) => result.get(item.id)?.change)).toEqual(["renovated", "renovated", "renovated", "none", "none", "none", "renovated"]);
  });
});
