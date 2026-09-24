import { readFileSync, writeFileSync } from "node:fs";
import { openApiDocument } from "../src/lib/openapi";

const expected = `${JSON.stringify(openApiDocument, null, 2)}\n`;
const file = new URL("../openapi.json", import.meta.url);

if (process.argv.includes("--check")) {
  let actual = "";
  try {
    actual = readFileSync(file, "utf8");
  } catch {
    // A missing copy is drift too.
  }
  if (actual !== expected) {
    console.error("openapi.json differs from the route registry. Run npm run openapi:generate.");
    process.exitCode = 1;
  }
} else {
  writeFileSync(file, expected);
}
