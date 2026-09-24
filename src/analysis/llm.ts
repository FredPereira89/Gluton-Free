import Anthropic from "@anthropic-ai/sdk";
import type { LlmUsage } from "@/lib/job";

// Overridable so a model retirement (e.g. Haiku 4.5, guaranteed only until 2026-10-15) is a config change.
export const EXTRACT_MODEL = process.env.EXTRACT_MODEL || "claude-haiku-4-5";
export const JUDGE_MODEL = process.env.JUDGE_MODEL || "claude-sonnet-5";

// USD per million tokens: input, output. Cache writes cost 1.25x input, reads 0.1x; batches half.
const PRICE: Record<string, [number, number]> = {
  [EXTRACT_MODEL]: [1, 5],
  [JUDGE_MODEL]: [2, 10],
};

let client: Anthropic | undefined;
export function anthropic(): Anthropic {
  client ??= new Anthropic({ maxRetries: 4 });
  return client;
}

type RawUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function emptyUsage(purpose: string, model: string, batch: boolean): LlmUsage {
  return {
    at: new Date().toISOString(),
    purpose,
    model,
    batch,
    requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cost_usd: 0,
  };
}

/** Adds one response's usage into an accumulator, pricing it as it goes. */
export function addUsage(acc: LlmUsage, u: RawUsage): void {
  const [inP, outP] = PRICE[acc.model] ?? [0, 0];
  const cw = u.cache_creation_input_tokens ?? 0;
  const cr = u.cache_read_input_tokens ?? 0;
  const factor = acc.batch ? 0.5 : 1;
  acc.requests += 1;
  acc.input_tokens += u.input_tokens;
  acc.output_tokens += u.output_tokens;
  acc.cache_creation_input_tokens += cw;
  acc.cache_read_input_tokens += cr;
  acc.cost_usd += (factor * (u.input_tokens * inP + cw * inP * 1.25 + cr * inP * 0.1 + u.output_tokens * outP)) / 1e6;
}
