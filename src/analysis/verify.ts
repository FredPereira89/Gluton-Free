// Red-flag verification (Sonnet). The extractor over-reports on purpose; this pass confirms or
// rejects each flag against the full Review, so only confirmed first-hand incidents can force Avoid.
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import type { LlmUsage } from "@/lib/job";
import { addUsage, anthropic, JUDGE_MODEL } from "./llm";

export const VERIFIER_VERSION = `${JUDGE_MODEL}|verify-v2`;

const Out = z.object({
  confirmed: z.boolean().describe("true if the Review really describes this kind of incident"),
  first_hand: z.boolean().describe("true if the reviewer or their own party experienced it"),
  reason: z.string().describe("one sentence"),
});
const format = zodOutputFormat(Out);

const DEFINITIONS: Record<string, string> = {
  food_poisoning: "someone fell ill after eating at the restaurant",
  hygiene: "dirt, pests, spoiled food, or unclean kitchen, tables or toilets",
  scam_overcharge:
    "deliberate overcharging: billed for items not ordered or an uneaten couvert charged, prices different from the menu, or pressure to pay more. A pricey couvert that was ordered or eaten is a value complaint, not a scam; a mistake that was corrected is not a scam.",
  other_safety: "injury, violence, theft, or serious mishandling of an allergy",
};

export async function verifyPendingFlags(restaurantId: number, usage: LlmUsage): Promise<{ confirmed: number; rejected: number }> {
  const sql = db();
  const pending = await sql`
    select f.id, f.type, f.evidence, r.text
    from review_flag f
    join review r on r.id = f.review_id
    join listing l on l.id = r.listing_id
    where l.restaurant_id = ${restaurantId} and f.verification = 'pending' and r.text is not null`;
  let confirmed = 0;
  let rejected = 0;
  for (const f of pending) {
    const res = await anthropic().messages.parse({
      model: JUDGE_MODEL,
      max_tokens: 2048,
      output_config: { effort: "low", format },
      messages: [
        {
          role: "user",
          content: `A restaurant Review was flagged as reporting a "${f.type}" incident: ${DEFINITIONS[f.type as string]}.

Decide whether the Review really describes such an incident at this restaurant, and whether the reviewer or their own party experienced it (as opposed to hearsay, a warning about other places, or a general complaint).

Flagged passage: ${f.evidence}

<review>
${f.text}
</review>`,
        },
      ],
    });
    addUsage(usage, res.usage);
    const out = res.parsed_output;
    if (!out) continue;
    const ok = out.confirmed;
    await sql`
      update review_flag set
        verification = ${ok ? "confirmed" : "rejected"},
        first_hand = ${ok ? out.first_hand : false},
        verifier_version = ${VERIFIER_VERSION}, verified_at = now()
      where id = ${f.id}`;
    if (ok) confirmed++;
    else rejected++;
  }
  return { confirmed, rejected };
}
