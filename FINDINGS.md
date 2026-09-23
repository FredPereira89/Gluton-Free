# Research: LLM analysis pipeline, approach and cost (#4)

Ticket: https://github.com/FredPereira89/Gluton-Free/issues/4 · Map: #1 · Researched 2026-09-23.
Terms follow `CONTEXT.md` (Restaurant, Source, Review, Verdict, Tier, Not enough evidence, Aspect, Format, Access tag, Evidence).
All prices are USD from Anthropic's live docs as of today. For budgeting, treat USD as roughly EUR; this overstates EUR cost slightly while EUR trades above USD.

---

## 1. Answer in one paragraph

Use a **two-model LLM pipeline plus deterministic statistics**. **Claude Haiku 4.5** (`claude-haiku-4-5`) does bulk per-Review extraction through the **Message Batches API** with **structured outputs**. It packs about 20 Reviews of one Restaurant into each request and returns a compact JSON record per Review: an ordinal −2..+2 score per Aspect or null, red-flag candidates, an "exceptional" marker, theme tags, and at most one short quote. **Claude Sonnet 5** (`claude-sonnet-5`) runs two small follow-up jobs: it (a) re-checks only the few percent of Reviews flagged for red flags, and (b) writes the Verdict explanation and translates the selected Evidence quotes. **The Tier is never chosen by an LLM.** Code rolls the per-Review signals up into recency-weighted scores per Aspect, shrinks them toward the Format mean with empirical Bayes, and converts them to percentiles within the Format. The Verdict rule (#7) then applies its gates to those percentiles. Extraction costs about **$0.24–0.33 per 1,000 text-bearing Reviews** (batch). That puts one Restaurant at about **$0.2 (500 Reviews) / $1 (3,000 Reviews)**, the Lisbon baseline at about **$9–12 one-off (30,000 Reviews)**, and steady-state monthly LLM spend at about **$3–9**, well inside the ~EUR 25/month budget.

---

## 2. Current Claude facts that drive the design (verified live)

| Fact | Value | Source |
|---|---|---|
| Current lineup | Fable 5.1 `claude-fable-5-1` ($10/$50), **Opus 5.5** `claude-opus-5-5` ($4/$20, launched 2026-09-22), Sonnet 5 `claude-sonnet-5` ($2/$10), Haiku 4.5 `claude-haiku-4-5` ($1/$5) | [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview.md) |
| Sonnet 5 price | $2/$10 is now the **permanent** price. The previously planned rise to $3/$15 will not happen | [Pricing](https://platform.claude.com/docs/en/about-claude/pricing.md) |
| Batch prices | Haiku 4.5 $0.50/$2.50 · Sonnet 5 $1/$5 · Opus 5.5 $2/$10 per MTok (50% off) | [Pricing → Batch processing](https://platform.claude.com/docs/en/about-claude/pricing.md) |
| Caching and batch stack | "These multipliers stack with other pricing modifiers, including the Batch API discount". Cache read = 0.1× input (0.05× on Opus 5.5); 5-min write 1.25×, 1-h write 2× | [Pricing → Prompt caching](https://platform.claude.com/docs/en/about-claude/pricing.md) |
| Minimum cacheable prefix | **Haiku 4.5: 4,096 tokens**; Sonnet 5: 1,024; Opus 5.5: 512. Shorter prefixes silently don't cache | [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md) |
| Cache hits inside batches | "best-effort … typically 30% to 98%". Docs recommend the **1-hour TTL** for batches | [Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing.md) |
| Batch limits | 100,000 requests or 256 MB per batch; most finish in < 1 h; expire at 24 h (expired requests not billed); results kept 29 days. Not allowed in batch: `stream`, `speed`, `max_tokens: 0`. Everything else is allowed (structured outputs, tools, thinking) | [Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing.md) |
| Structured outputs | **GA on Haiku 4.5**, Sonnet 5, Opus 5.x. Constrained decoding means the response always matches the schema. Supports `enum`, `const`, `anyOf`, `required`, `additionalProperties:false`. **Not supported:** `minimum`/`maximum`, `minLength`/`maxLength`, `maxItems`, `minItems` > 1, recursive schemas. Compiled grammar is cached for 24 h; changing the schema invalidates the prompt cache | [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md) |
| Tokenizer | Claude 4.7 and later models (so Sonnet 5 and Opus 5.5) produce **~30% more tokens** for the same text. Haiku 4.5 uses the older tokenizer | [Pricing](https://platform.claude.com/docs/en/about-claude/pricing.md) |
| Thinking | Haiku 4.5: extended thinking, off unless requested; effort not supported. Sonnet 5: adaptive by default, `disabled` accepted. Opus 5.5: adaptive, **always on** (thinking tokens are billed as output) | [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview.md) |
| **Haiku 4.5 lifecycle** | Active, not deprecated. Retirement is "**not sooner than October 15, 2026**", with at least 60 days' notice. No newer Haiku exists | [Model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations.md) |

---

## 3. LLM vs classical / embedding approaches

| Option | Fit for Gluton-Free | Verdict |
|---|---|---|
| **Multilingual ABSA models** (e.g. PyABSA multilingual checkpoints, Arctic-ABSA-style fine-tunes) | Fine-tuned ABSA models can beat zero-shot LLMs on benchmark ABSA. [Arctic-ABSA](https://arxiv.org/abs/2601.03940) reports +10 pp over GPT-4o / Claude 3.5 Sonnet and 87–91% accuracy across six languages, and [Wu et al. 2024](https://arxiv.org/abs/2412.12564) find zero-shot LLMs "generally fall short of fine-tuned, task-specific models". But these benchmarks score span/triplet extraction, which is harder than our task: we only need six fixed Aspect categories and a coarse ordinal score. The classical models also cover **none** of red flags, "exceptional" language, quote selection or translation. The classic restaurant benchmark data (SemEval-2016 Task 5) covers EN, NL, FR, RU, ES and TR for restaurants, with **no PT, DE or IT** ([task page](https://alt.qcri.org/semeval2016/task5/)). [M-ABSA](https://github.com/swaggy66/M-ABSA) (EMNLP 2025, 21 languages incl. PT, has a restaurant domain) could fill that gap, but the model would still need training and a host (CPU/GPU) we don't have in budget. [PyABSA](https://github.com/yangheng95/PyABSA) | **Reject for MVP.** Keep as a possible cost fallback if LLM prices ever rise. |
| **Embeddings + clustering for themes** | Cheap: [Voyage](https://docs.voyageai.com/docs/pricing) `voyage-multilingual-2` costs $0.12/MTok with 50M free tokens, and the whole baseline is about 5M tokens. But clusters still need naming, and Evidence needs readable themes. Asking the extractor for theme tags from a controlled vocabulary gives readable, countable themes at almost no extra cost | **Defer.** Worth adding later for near-duplicate / fake-Review detection (a "not yet specified" item on #1). |
| **LLM extraction (Haiku 4.5) + LLM verify/explain (Sonnet 5)** | One pass covers all signals in all languages, the schema is guaranteed by structured outputs, and cost is small (§5) | **Recommend.** |

Rationale for keeping the Tier deterministic: the Tier comes from percentiles and gates, and the LLM only explains it. That makes Verdicts reproducible and auditable. It also stops an LLM's "opinion" from leaking in, which matters because Verdicts must be impartial and the same for every user.

---

## 4. Recommended pipeline shape

```
Ingest (per Source, deduped by Source review ID, no reviewer identity)
  │
  ├─ 0. Pre-filter (code, free)
  │     • no text / < ~20 chars / emoji-only → "rating-only": no LLM call, still counts for the rating signal
  │     • exact-duplicate text (hash) across Sources → analyse once, link both
  │     • strip reviewer names, @handles, emails, phone numbers from text before sending (PII rule)
  │     • already analysed with the current (model_id, prompt_version) → skip
  │
  ├─ 1. Extraction — Haiku 4.5, Message Batches, structured outputs
  │     • one request = ~20 Reviews of ONE Restaurant (+ Restaurant name, Format, city as context)
  │     • stable prefix ≥ 4,096 tokens (instructions + schema notes + multilingual few-shots),
  │       cache_control ttl "1h" → cacheable on Haiku; Review texts after the breakpoint
  │     • thinking off; max_tokens sized to ~150 × Reviews in request
  │     • Review text wrapped as untrusted data (prompt-injection hygiene)
  │     • on-demand lookup: first ~300 most-recent Reviews via the synchronous API (seconds),
  │       the long tail via batch (< 1 h typical)
  │
  ├─ 2. Red-flag verification — Sonnet 5 (batch, or sync for on-demand), only flagged Reviews (~2–5%)
  │     • input: the one Review + candidate flag; output: {confirmed, type, first_hand, severity, incident_hint}
  │     • high precision matters because a confirmed recurring + recent flag forces Avoid
  │
  ├─ 3. Roll-up — code (SQL/Python), deterministic, see §6
  │     • per-Aspect Restaurant scores → Format percentiles → Verdict rule (#7) → Tier + confidence
  │
  └─ 4. Explanation & Evidence — Sonnet 5 (sync on demand; batch for bulk)
        • input: computed Tier, percentiles, confidence, top themes (+/−), ~40 candidate quotes
          (original language) chosen by code from high-|score| Reviews across Sources
        • output: 2–4 sentence explanation, 3–6 chosen quotes + English translations, theme labels
        • the model may not change the Tier; regenerate only when Tier/percentiles/evidence materially change
```

Store every extraction row with `model_id`, `prompt_version`, `schema_version` and `analysed_at`. On refresh, analyse **only new Reviews**. A full re-analysis happens only on a deliberate prompt or model version bump, and it costs about one baseline (§5).

### Extraction schema sketch (JSON Schema for `output_config.format`)

Scores use integer `enum`s, because structured outputs rejects `minimum`/`maximum`. Array caps (≤ 3 themes, ≤ 3 flags) go in the prompt and are enforced again in code, because `maxItems` is unsupported. Short keys keep output tokens down, and output tokens are about 60% of the cost.

```json
{
  "type": "object", "additionalProperties": false, "required": ["reviews"],
  "properties": { "reviews": { "type": "array", "items": {
    "type": "object", "additionalProperties": false,
    "required": ["i","lang","food","service","ambience","value","wait","consistency","exceptional","flags","themes","quote"],
    "properties": {
      "i":           { "type": "integer" },                         // index of the Review in this request
      "lang":        { "type": "string" },                          // ISO 639-1, e.g. "pt"
      "food":        { "enum": [-2, -1, 0, 1, 2, null] },           // null = not mentioned; 0 = mixed/neutral
      "service":     { "enum": [-2, -1, 0, 1, 2, null] },
      "ambience":    { "enum": [-2, -1, 0, 1, 2, null] },
      "value":       { "enum": [-2, -1, 0, 1, 2, null] },
      "wait":        { "enum": [-2, -1, 0, 1, 2, null] },
      "consistency": { "enum": [-2, -1, 0, 1, 2, null] },           // only explicit multi-visit statements
      "exceptional": { "enum": ["none", "food", "service", "overall"] }, // superlative, "best of my life"-class language
      "flags": { "type": "array", "items": {
        "type": "object", "additionalProperties": false,
        "required": ["type", "first_hand", "severity", "evidence"],
        "properties": {
          "type":       { "enum": ["food_poisoning", "hygiene", "scam_overcharge", "other_safety"] },
          "first_hand": { "type": "boolean" },                      // reviewer's own experience vs hearsay
          "severity":   { "enum": ["low", "high"] },
          "evidence":   { "type": "string" }                        // ≤ 15-word verbatim fragment
        } } },
      "themes": { "type": "array", "items": { "type": "string" } }, // ≤ 3, controlled vocabulary + dish names
      "quote":  { "anyOf": [ { "type": "string" }, { "type": "null" } ] } // ≤ 25 words verbatim, no names
    } } } }
}
```

(Comments are illustrative; the real schema is plain JSON.) Prompt rules to include: score only what the text says, since stars don't imply Aspects; "0" means mixed; "value" means price relative to experience, not cheapness; Lisbon-specific calibration, e.g. whether complaints about unrequested couvert count as `scam_overcharge` or only as negative `value` (a decision for #7); never output personal names in `quote` or `evidence`.

---

## 5. Cost model and table

**Assumptions** (to be replaced by measured `usage` numbers in the walking skeleton, #11):
- A text-bearing Review is about 150 input tokens (≈ 80 words incl. Romance-language overhead, plus a wrapper). Output is about 60 tokens with the compact schema.
- Stable prefix is 4,200 tokens and a request holds 20 Reviews. The ranges below run from "prefix cached" (0.1×) to "no cache hit" (batch hits are best-effort).
- Sonnet 5 and Opus 5.5 token counts are ×1.3 (new tokenizer). Opus 5.5 figures exclude always-on thinking, so they are a lower bound.
- About 3% of Reviews are flagged and get Sonnet 5 verification (≈ 700 in / 200 out). An explanation is ≈ 6,000 in / 1,500 out (incl. thinking) on Sonnet 5.
- About half of Google Reviews carry no text ([SOCi, 4.9M reviews](https://www.soci.ai/insights/state-of-google-reviews/): 52.4% had no text). Those skip the LLM entirely. The figures below count **text-bearing** Reviews only, which is conservative if the ticket's Review counts include rating-only ones.

**Per 1,000 text-bearing Reviews, extraction only:**

| Model | Batch | Synchronous |
|---|---|---|
| **Haiku 4.5** | **$0.24 – 0.33** | $0.47 – 0.66 |
| Sonnet 5 | $0.61 – 0.86 | $1.23 – 1.72 |
| Opus 5.5 (lower bound) | $1.20 – 1.72 | $2.40 – 3.43 |

Add-ons: red-flag verification ≈ $0.05 per 1k Reviews (batch), $0.10 (sync). Explanation ≈ $0.014 per Restaurant (batch), $0.027 (sync), $0.07 with Opus 5.5.

**Scenarios (Haiku 4.5 extraction + Sonnet 5 verify/explain):**

| Scenario | Reviews (text) | All-batch | On-demand mix (sync) | Notes |
|---|---:|---:|---:|---|
| One Restaurant, ~500 Reviews | 500 | **$0.16 – 0.21** | $0.32 – 0.41 | 1 explanation |
| One Restaurant, ~3,000 Reviews | 3,000 | **$0.89 – 1.17** | $1.75 – 2.32 | Optional cap: newest 1,000 + a 500-Review stratified sample of older ones ≈ $0.40 |
| Lisbon baseline, 300 × 100 | 30,000 | **$8.6 – 11.4 one-off** | n/a | Explanations generated lazily; +$4 to pre-generate all 300 |
| Monthly refresh, ~350 tracked Restaurants × ~15 new text Reviews | ~5,250 | **$1.5 – 2.0 / month** | n/a | + ~$1 for re-explaining ~20% whose Evidence changed |
| On-demand lookups, ~20 new Restaurants/month × 500 | 10,000 | n/a | **$4.8 – 6.3 / month** | First 300/Restaurant sync, rest batch; halve for 10 lookups |
| **Steady state total LLM** | | | **≈ $3 – 9 / month** | Baseline one-off on top |

**Budget read:** with Haiku 4.5, LLM spend takes about 10–35% of the EUR 25 budget in steady state. The one-off baseline (≈ $9–12) fits into a first month that has little hosting spend, or it can be spread over two months.

**Sensitivity / risks:**
- **Haiku 4.5 retirement.** Its commitment ends "not sooner than 2026-10-15". The fallback is Sonnet 5, which costs about 2.6× (price × tokenizer): baseline ≈ $23–30 and steady state ≈ $8–20/month. That would squeeze the budget. Mitigations: model ID in config; cap the baseline at the newest ~50 text Reviews per Restaurant; re-check the deprecations page before the build. Anthropic gives at least 60 days' notice, so the earliest realistic retirement is late November 2026.
- **Output tokens are about 60% of cost.** Keep the schema terse. Don't translate per Review; translate only the selected Evidence quotes. Keep `quote` optional.
- **Caching is a minor lever here** (it saves ≈ $0.10 per 1k Reviews). Few-shots are worth including for quality anyway, and a prefix of ≥ 4,096 tokens makes them cacheable on Haiku.
- **Packing 20 Reviews per request** gives most of the fixed-prompt saving. The risk is cross-Review contamination. The gold-set eval (§7) should compare 1-per-request against 20-per-request once.

---

## 6. From per-Review signals to percentile-comparable Aspect scores

Goal: a score per Restaurant per Aspect that can be ranked **within its Format in Lisbon**, is robust to Aspects that are rarely mentioned, and carries a confidence.

1. **Per-Review value.** `s ∈ {−2,−1,0,+1,+2}` or null for each Aspect. Null is excluded from that Aspect. It is never treated as 0.
2. **Weights.** `w = recency × source × credibility`.
   - Recency is `0.5^(age / half-life)`, with a half-life of about 18 months (tunable in #7).
   - Source weight comes from #9 and credibility from the credibility model (both open on #1).
   - Effective sample size is `n_eff = (Σw)² / Σw²` (Kish).
3. **Empirical-Bayes shrinkage to the Format prior.**
   `θ̂_a = (Σ w·s + k_a · μ_{F,a}) / (Σ w + k_a)`
   - `μ_{F,a}` is the weighted mean of Aspect *a* across all Reviews of the Format.
   - `k_a` (pseudo-count) is estimated per Aspect from between- vs within-Restaurant variance (method of moments), or starts at about 10.
   - Effect: an Aspect with 3 mentions stays near the Format mean, so its percentile sits near the middle. A thinly covered Aspect can't make or break a Verdict, which answers "Aspects rarely mentioned".
   - Posterior SD ≈ `σ_a / √(Σw + k_a)`. It feeds the Verdict confidence.
4. **Percentile within the Format.**
   - Mid-rank percentile of `θ̂_a` among Lisbon peers of the same Format that have `n_eff ≥ n_min` for that Aspect.
   - Restaurants below `n_min` get their Aspect shown as "little evidence" and are left out of that Aspect's percentile (but not out of the Verdict).
   - Percentile ranks automatically cancel Aspect-level reporting bias. For example, "wait" is mostly mentioned when it is bad, so its raw mean is negative everywhere, but ranking compares like with like.
5. **Overall rating signal.** Star ratings, including rating-only Reviews, are normalised **per Source** (a percentile within Source × Format, because Google 4.6 and TheFork 9.0 aren't comparable). The result is a separate overall-satisfaction input. It carries the half of Google Reviews that have no text.
6. **Consistency** is mostly **derived**, not extracted: dispersion (SD / IQR) of per-Review food and overall scores within recent windows, plus trend over time. Explicit multi-visit statements (`consistency` field) are a secondary signal. This connects to the "Trends & consistency" open item on #1.
7. **Exceptional language** (for Life Changing). Rate `p_exc = count(exceptional ∈ {food, overall}) / text Reviews`, recency-weighted and shrunk with a Beta-binomial Format prior. "Recurring" means a minimum absolute count (e.g. ≥ 5 in 24 months, from ≥ 2 Sources) **and** `p_exc` in the Format's top tail. Thresholds belong to #7.
8. **Red flags** are counted only after verification (`confirmed ∧ first_hand`). "Recurring + recent" is evaluated deterministically, e.g. ≥ 2 independent confirmed incidents of the same type within 12 months, with the latest within 6 months. Exact numbers belong to #7. Flags never pass through the percentile machinery; they gate.
9. **Weighted composite** for Tiers: food and service weigh most. The weights and the percentile-to-Tier mapping are #7's job. This pipeline supplies `θ̂`, the percentile, `n_eff` and the SD for each Aspect.

---

## 7. Quality assurance (cheap, do once in #11)

- **Gold set.** About 200–300 Reviews stratified by language (PT, EN, FR, ES, DE, IT) and Source, including known red-flag and superlative examples. Use Opus 5.5 as a reference labeller (≈ $1) plus hand spot-checks. Labelling what a Review's text says is not the user's opinion of a Restaurant, so impartiality holds.
- **Metrics.** Per-Aspect agreement (exact and ±1) Haiku vs reference; red-flag recall and precision (after the Sonnet check); exceptional-marker precision; quote-contains-no-names check.
- **Gate.** Adopt Haiku 4.5 if it is within an agreed tolerance of Sonnet 5 on food and service. Otherwise use Sonnet 5 for extraction and trim the baseline depth.

---

## 8. Things that should change other tickets

- **#7 Verdict rule.** It should consume `θ̂`, the percentile, `n_eff` and the SD per Aspect. It must set the half-life, `n_min`, the red-flag recurrence and recency thresholds, the exceptional-language thresholds, and how to treat couvert complaints. Consistency is best defined as a derived dispersion/trend metric, not an extracted Aspect.
- **#6 Format taxonomy.** Percentiles need enough peers per Format. With 300 baseline Restaurants split across, say, 8–10 Formats, some Formats will have fewer than 20 peers, so the top 2% (Life Changing) is **statistically meaningless** in them. Suggest a fallback such as pooling small Formats, or a city-wide ranking with a Format offset, plus minimum peer counts.
- **#2 / #3 / #9 Sources.** The cost model assumes about 100 **text-bearing** Reviews per baseline Restaurant. About half of Google Reviews have no text. Whatever the chosen Sources deliver, rating-only Reviews are free to process but carry no Aspect information.
- **#5 Stack.** Needs a background job that submits and polls batches (results arrive in < 1 h typically, 24 h worst case), plus a synchronous path for on-demand lookups. Store per-Review extraction rows keyed by Source review ID and `prompt_version`.
- **#10 Accounts.** One Anthropic API key (workspace-scoped, since caches are per workspace); a Voyage key is not needed for the MVP.
- **Model risk.** Haiku 4.5's retirement window opens 2026-10-15, with at least 60 days' notice. Re-verify before building, and keep the model ID configurable.

---

## Sources

- Anthropic, Models overview: https://platform.claude.com/docs/en/about-claude/models/overview.md
- Anthropic, Pricing (model, batch, caching, tokenizer, data residency): https://platform.claude.com/docs/en/about-claude/pricing.md
- Anthropic, Model deprecations: https://platform.claude.com/docs/en/about-claude/model-deprecations.md
- Anthropic, Batch processing: https://platform.claude.com/docs/en/build-with-claude/batch-processing.md
- Anthropic, Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md
- Anthropic, Structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md
- SemEval-2016 Task 5 (ABSA) task page and languages: https://alt.qcri.org/semeval2016/task5/
- M-ABSA multilingual ABSA dataset (EMNLP 2025): https://github.com/swaggy66/M-ABSA
- PyABSA framework: https://github.com/yangheng95/PyABSA
- Wu et al., Evaluating Zero-Shot Multilingual ABSA with LLMs (2024): https://arxiv.org/abs/2412.12564
- Arctic-ABSA, Large-Scale ABSA with Reasoning-Infused LLMs (2026): https://arxiv.org/abs/2601.03940
- Voyage AI embedding pricing: https://docs.voyageai.com/docs/pricing
- SOCi, The State of Google Reviews (share of reviews without text): https://www.soci.ai/insights/state-of-google-reviews/
