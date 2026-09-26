import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

// Secrets the lookup task needs, copied from the deploying machine's environment on each deploy.
const TASK_SECRETS = [
  "SUPABASE_DB_URL",
  "ANTHROPIC_API_KEY",
  "DATAFORSEO_LOGIN",
  "DATAFORSEO_PASSWORD",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
] as const;

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
  build: {
    extensions: [
      syncEnvVars(() => {
        const missing = TASK_SECRETS.filter((k) => !process.env[k]);
        if (missing.length) throw new Error(`missing env for deploy: ${missing.join(", ")}`);
        return TASK_SECRETS.map((name) => ({ name, value: process.env[name]!, isSecret: true }));
      }),
    ],
  },
});
