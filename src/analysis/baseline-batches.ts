import { batchEnded, CHUNK, collectBatch, estimateExtractBatchUpperBound, submitBatch, type ExtractInput, type Extracted } from "./extract";
import { addUsage, anthropic, emptyUsage, estimateBatchUpperBound, EXTRACT_MODEL } from "./llm";
import type { LlmUsage } from "@/lib/job";
import type { BaselineFormat } from "@/domain/baseline-format";
import type { BaselineFormatInput } from "@/pipeline/baseline-build";
import type { BaselineSpendBudget } from "@/pipeline/baseline-budget";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const MAX_BATCH_WAIT_SECONDS = 3 * 60 * 60;
const EXTRACTION_BATCH_REVIEWS = 5_000;
const FORMAT_BATCH_RESTAURANTS = 500;
const formatSchema = z.object({ formats: z.array(z.object({ i: z.number().int(), format: z.enum([
  "tasca", "restaurante_tradicional", "marisqueira_cervejaria", "churrasqueira", "casa_de_fado",
  "casual_contemporary", "international_casual", "fine_dining", "cafe_pastelaria", "brunch_all_day_cafe", "snack_street",
]) })) });
const formatOutput = zodOutputFormat(formatSchema);

export type BaselineBatchOptions = {
  sleep: (seconds: number) => Promise<void>;
  onUsage?: (usage: LlmUsage) => void | Promise<void>;
};

async function waitForBatch(batchId: string, sleep: BaselineBatchOptions["sleep"]): Promise<void> {
  for (let waited = 0; !(await batchEnded(batchId)); waited += 30) {
    if (waited > MAX_BATCH_WAIT_SECONDS) throw new Error(`Anthropic batch ${batchId} exceeded the three-hour limit`);
    await sleep(30);
  }
}

async function runReservedBatch<T>(
  spend: BaselineSpendBudget,
  maximumUsd: number,
  usage: LlmUsage,
  onUsage: BaselineBatchOptions["onUsage"],
  operation: () => Promise<T>,
): Promise<{ result: T; costUsd: number }> {
  const settle = await spend.reserve("llm")(maximumUsd);
  let settled = false;
  let usageReported = false;
  try {
    const result = await operation();
    const costUsd = usage.cost_usd;
    settled = true;
    await settle(costUsd);
    usageReported = true;
    await onUsage?.(usage);
    return { result, costUsd };
  } catch (error) {
    if (!settled) await settle(usage.cost_usd);
    if (usage.requests && !usageReported) await onUsage?.(usage);
    throw error;
  }
}

/** Runs frozen review extraction in bounded Batch API groups so every spend can be reserved first. */
export async function extractBaselineBatch(
  items: ExtractInput[],
  spend: BaselineSpendBudget,
  options: BaselineBatchOptions,
): Promise<{ results: Map<number, Extracted>; costUsd: number }> {
  const results = new Map<number, Extracted>();
  let costUsd = 0;
  const groupSize = Math.floor(EXTRACTION_BATCH_REVIEWS / CHUNK) * CHUNK;
  for (let start = 0; start < items.length; start += groupSize) {
    const group = items.slice(start, start + groupSize);
    const usage = emptyUsage("baseline-extract", EXTRACT_MODEL, true);
    const run = await runReservedBatch(
      spend,
      estimateExtractBatchUpperBound(group),
      usage,
      options.onUsage,
      async () => {
        const batchId = await submitBatch(group);
        await waitForBatch(batchId, options.sleep);
        return collectBatch(batchId, group, usage);
    });
    for (const [id, extracted] of run.result) results.set(id, extracted);
    costUsd += run.costUsd;
  }
  return { results, costUsd };
}

const FORMAT_GUIDE = `Assign exactly one Lisbon Restaurant Format from its Review text. Use the restaurant's defining service model and occasion, not cuisine alone.
- tasca: modest, informal Portuguese neighborhood tavern.
- restaurante_tradicional: sit-down traditional Portuguese restaurant.
- marisqueira_cervejaria: seafood-led restaurant or beer hall.
- churrasqueira: grilled or roast-meat house.
- casa_de_fado: Fado performance is a defining part of the dining offer.
- casual_contemporary: relaxed, contemporary full-service restaurant.
- international_casual: casual restaurant whose defining offer is a non-Portuguese cuisine.
- fine_dining: formal or high-end restaurant, often with a tasting menu.
- cafe_pastelaria: café, bakery, or pastry shop.
- brunch_all_day_cafe: brunch or breakfast is the defining offer.
- snack_street: counter-service, takeaway, or street-food offer.
Return the best-supported Format from the Reviews. If evidence is sparse, choose the closest Format rather than inventing details.`;

function formatUserContent(entry: BaselineFormatInput, index: number): string {
  const sample = entry.reviews.flatMap(({ text }) => text?.trim() ? [text] : []).slice(0, 20);
  return `<restaurant i="${index}">\n${sample.map((text) => `<review>${text}</review>`).join("\n")}\n</restaurant>`;
}

function parseFormats(value: string): { i: number; format: BaselineFormat }[] {
  try {
    const parsed = formatSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data.formats : [];
  } catch {
    return [];
  }
}

/** Uses the Batch API to confirm every sampled Restaurant's Format using only its recent Reviews. */
export async function confirmBaselineFormatsBatch(
  restaurants: BaselineFormatInput[],
  spend: BaselineSpendBudget,
  options: BaselineBatchOptions,
): Promise<{ formats: Map<string, BaselineFormat>; costUsd: number }> {
  const formats = new Map<string, BaselineFormat>();
  let costUsd = 0;
  for (let start = 0; start < restaurants.length; start += FORMAT_BATCH_RESTAURANTS) {
    const group = restaurants.slice(start, start + FORMAT_BATCH_RESTAURANTS);
    const requests = group.map((entry, index) => ({
      custom_id: `p${index}`,
      params: {
        model: EXTRACT_MODEL,
        max_tokens: 512,
        system: [{ type: "text" as const, text: FORMAT_GUIDE }],
        messages: [{ role: "user" as const, content: formatUserContent(entry, start + index) }],
        output_config: { format: { type: formatOutput.type, schema: formatOutput.schema } },
      },
    }));
    const estimate = estimateBatchUpperBound(EXTRACT_MODEL, requests.map((request) => `${FORMAT_GUIDE}\n${request.params.messages[0]!.content}`), 512);
    const usage = emptyUsage("baseline-format-confirmation", EXTRACT_MODEL, true);
    const run = await runReservedBatch(spend, estimate, usage, options.onUsage, async () => {
      const createdBatch = await anthropic().messages.batches.create({ requests });
      await waitForBatch(createdBatch.id, options.sleep);
      const confirmed = new Map<string, BaselineFormat>();
      for await (const result of await anthropic().messages.batches.results(createdBatch.id)) {
        if (result.result.type !== "succeeded") continue;
        addUsage(usage, result.result.message.usage);
        const index = Number(result.custom_id.slice(1));
        const entry = group[index];
        if (!entry) continue;
        const text = result.result.message.content.find((part) => part.type === "text");
        if (!text || text.type !== "text") continue;
        const format = parseFormats(text.text).find((row) => row.i === start + index)?.format;
        if (format) confirmed.set(entry.candidate.placeId, format);
      }
      return confirmed;
    });
    for (const [placeId, format] of run.result) formats.set(placeId, format);
    costUsd += run.costUsd;
  }
  return { formats, costUsd };
}
