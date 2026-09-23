import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  dirs: ["./src/trigger"],
  runtime: "node",
  // Batches usually finish within an hour; waits are checkpointed, so this caps compute, not wall time.
  maxDuration: 3600,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000, factor: 2 },
  },
});
