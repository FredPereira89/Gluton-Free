import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("PWA manifest", () => {
  it("declares an installable standalone app with correctly sized icons", () => {
    const app = manifest();
    expect(app).toMatchObject({
      name: "Gluton-Free",
      short_name: "Gluton-Free",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });

    for (const [path, size] of [["public/icon-192.png", 192], ["public/icon-512.png", 512]] as const) {
      expect(existsSync(path)).toBe(true);
      const png = readFileSync(path);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
      expect(app.icons?.some((icon) => icon.src === `/${path.split("/").at(-1)}` && icon.sizes === `${size}x${size}`)).toBe(true);
    }
    expect(existsSync("public/apple-touch-icon.png")).toBe(true);
  });
});
