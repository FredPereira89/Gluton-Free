import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RestaurantFactsEditor } from "./restaurant-facts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("RestaurantFactsEditor", () => {
  it("shows owner controls for Format and Price tier", () => {
    const html = renderToStaticMarkup(createElement(RestaurantFactsEditor, {
      slug: "casa-do-bacalhau", format: "tasca", priceTier: "€€", busy: false,
    }));
    expect(html).toContain("Format");
    expect(html).toContain("Tasca");
    expect(html).toContain("Price tier");
    expect(html).toContain("€€");
    expect(html).toContain("Save Restaurant details");
  });
});
