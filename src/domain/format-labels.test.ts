import { describe, expect, it } from "vitest";
import { FORMAT_FAMILY } from "@/verdict/peer";
import { FORMATS } from "./restaurant-facts";
import { FORMAT_FAMILIES, formatFamily, formatLabel } from "./format-labels";

describe("Format labels", () => {
  it("files every Format under the same family the Peer group uses", () => {
    for (const format of FORMATS) expect(formatFamily(format)).toBe(FORMAT_FAMILY[format]);
  });

  it("gives every Format a human label, never its code", () => {
    for (const format of FORMATS) {
      const label = formatLabel(format);
      expect(label).not.toContain("_");
      expect(label).toMatch(/^[A-Z]/);
    }
    expect(formatLabel("cafe_pastelaria")).toBe("Café & pastelaria");
    expect(formatLabel("marisqueira_cervejaria")).toBe("Marisqueira & cervejaria");
  });

  it("never shows a code for an unknown Format either", () => {
    expect(formatLabel("some_new_format")).toBe("Some new format");
  });

  it("groups every Format into one of the four Format families", () => {
    expect(FORMAT_FAMILIES.map((family) => family.label)).toEqual(["Traditional Portuguese", "Casual", "Fine dining", "Quick & café"]);
    expect(FORMATS.map(formatFamily).every((family) => FORMAT_FAMILIES.some((known) => known.code === family))).toBe(true);
    expect(formatFamily("tasca")).toBe("traditional_portuguese");
    expect(formatFamily("snack_street")).toBe("quick_cafe");
  });
});
