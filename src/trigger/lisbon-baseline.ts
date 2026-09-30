import { schemaTask, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { closeDb, db } from "@/lib/db";
import { EXTRACTOR_VERSION } from "@/analysis/extract";
import { addLlmUsage } from "@/lib/job";
import { confirmBaselineFormatsBatch, extractBaselineBatch } from "@/analysis/baseline-batches";
import { fetchBaselineGoogleReviewWindows, runLisbonBaselineSweep } from "@/pipeline/baseline";
import { runBaselineBuild, assertFrozenBaselineExtractorVersion } from "@/pipeline/baseline-build";
import { BaselineSpendBudget } from "@/pipeline/baseline-budget";
import { persistBaselineBuild } from "@/pipeline/baseline-persistence";
import { persistBaselineTripadvisorMatches } from "@/pipeline/baseline-persistence";
import { runBaselineTripadvisor } from "@/pipeline/baseline-tripadvisor";
import { baselineTripadvisorVendor } from "@/pipeline/baseline-tripadvisor-vendor";
import type { ExtractInput } from "@/analysis/extract";
import type { BaselineAnalysis } from "@/pipeline/baseline-build";

// The baseline can fan out to many DataForSEO calls; checkpoint Review polling in Trigger.dev.
export const lisbonBaselineTask = schemaTask({
  id: "lisbon-baseline-sweep",
  schema: z.object({ jobId: z.number().int().positive(), persist: z.boolean().default(false) }),
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async ({ jobId, persist }, { ctx }) => {
    const sql = db();
    try {
      const [job] = await sql`
        update job set status = 'running', step = 'Starting Lisbon baseline', trigger_run_id = ${ctx.run.id}, updated_at = now()
          where id = ${jobId} and kind = 'baseline'
        returning id
      `;
      if (!job) throw new Error("Lisbon baseline Job was not found");
      assertFrozenBaselineExtractorVersion(EXTRACTOR_VERSION);
      const spend = new BaselineSpendBudget();
      const report = await runLisbonBaselineSweep(new Date(), {
        sleep: (seconds) => wait.for({ seconds }),
        reserveVendorCost: spend.reserve("dataforseo"),
        onProgress: async (step) => {
          await sql`update job set step = ${step}, progress = ${sql.json({ phase: step } as never)}, updated_at = now() where id = ${jobId}`;
        },
        onVendorCost: async (costUsd) => {
          await sql`update job set vendor_cost_usd = vendor_cost_usd + ${costUsd}, updated_at = now() where id = ${jobId}`;
        },
      });
      const build = await runBaselineBuild(report.candidates, {
        fetchReviews: (requests) => fetchBaselineGoogleReviewWindows(
          requests,
          (seconds) => wait.for({ seconds }),
        ),
        extractBatch: (items, budget, onUsage) => extractBaselineBatch(items, budget, {
          sleep: (seconds) => wait.for({ seconds }),
          onUsage: async (usage) => {
            await addLlmUsage(jobId, usage);
            await onUsage?.(usage);
          },
        }),
        confirmFormats: (restaurants, budget, onUsage) => confirmBaselineFormatsBatch(restaurants, budget, {
          sleep: (seconds) => wait.for({ seconds }),
          onUsage: async (usage) => {
            await addLlmUsage(jobId, usage);
            await onUsage?.(usage);
          },
        }),
      }, {
        extractorVersion: EXTRACTOR_VERSION,
        spend,
        onProgress: async (step) => {
          await sql`update job set step = ${step}, progress = ${sql.json({ phase: step } as never)}, updated_at = now() where id = ${jobId}`;
        },
        onDataForSeoCost: async (costUsd) => {
          await sql`update job set vendor_cost_usd = vendor_cost_usd + ${costUsd}, updated_at = now() where id = ${jobId}`;
        },
      });
      const tripadvisor = await runBaselineTripadvisor(build.candidates,
        baselineTripadvisorVendor((seconds) => wait.for({ seconds })), {
          spend,
          onProgress: async (step) => {
            await sql`update job set step = ${step}, progress = ${sql.json({ phase: step } as never)}, updated_at = now() where id = ${jobId}`;
          },
          onCost: async (costUsd) => {
            await sql`update job set vendor_cost_usd = vendor_cost_usd + ${costUsd}, updated_at = now() where id = ${jobId}`;
          },
        });
      const tripadvisorInputs: ExtractInput[] = [];
      const sourceById = new Map<number, { placeRef: string; sourceReviewId: string }>();
      for (const match of tripadvisor.matches) {
        for (const review of match.window) {
          if (!review.text?.trim()) continue;
          const id = tripadvisorInputs.length + 1;
          tripadvisorInputs.push({ id, text: review.text, stars: review.stars });
          sourceById.set(id, { placeRef: match.placeRef, sourceReviewId: review.sourceReviewId });
        }
      }
      const extracted = await extractBaselineBatch(tripadvisorInputs, spend, {
        sleep: (seconds) => wait.for({ seconds }),
        onUsage: (usage) => addLlmUsage(jobId, usage),
      });
      const analysesByPlaceRef = new Map<string, BaselineAnalysis[]>();
      for (const [id, analysis] of extracted.results) {
        const source = sourceById.get(id);
        if (!source) continue;
        const entries = analysesByPlaceRef.get(source.placeRef) ?? [];
        entries.push({ sourceReviewId: source.sourceReviewId, analysis });
        analysesByPlaceRef.set(source.placeRef, entries);
      }
      const completeMatches = tripadvisor.matches.filter((match) => {
        const count = match.window.filter((review) => review.text?.trim()).length;
        if (analysesByPlaceRef.get(match.placeRef)?.length === count) return true;
        tripadvisor.skipped.push({ googlePlaceId: match.googlePlaceId, reason: "extraction_failed", candidates: [match.evidence] });
        return false;
      });
      const persisted = persist ? {
        google: await persistBaselineBuild(build.candidates),
        tripadvisor: await persistBaselineTripadvisorMatches(completeMatches, analysesByPlaceRef),
      } : null;
      const summary = {
        candidateCount: report.candidates.length,
        initiallySampled: Object.values(build.initialSampleCounts).reduce((total, count) => total + (count ?? 0), 0),
        confirmedCount: build.candidates.length,
        countsByFormat: build.countsByFormat,
        targets: build.targets,
        shortByFormat: build.shortByFormat,
        skippedWithoutText: build.skippedWithoutText,
        skippedExtraction: build.skippedExtraction,
        reviewDepths: {
          restaurants: Object.keys(build.fetchedDepthByPlaceId).length,
          max: Math.max(0, ...Object.values(build.fetchedDepthByPlaceId)),
        },
        incompleteReviewWindowPlaceIds: build.incompleteReviewWindowPlaceIds,
        tripadvisor: { matched: completeMatches.length, skipped: tripadvisor.skipped },
        dropped: report.dropped,
        costsUsd: spend.totals(),
        ...(persist ? { persisted } : {}),
      };
      await sql`
        update job set status = 'succeeded', step = 'Lisbon baseline complete', progress = ${sql.json(summary as never)},
          finished_at = now(), updated_at = now()
        where id = ${jobId}
      `;
      return summary;
    } catch (error) {
      const extractorMismatch = error instanceof Error && error.name === "ExtractorFreezeMismatchError";
      await sql`
        update job set status = 'failed', step = 'Lisbon baseline failed', error_code = ${extractorMismatch ? "extractor_not_frozen" : "baseline_failed"},
          error_detail = ${extractorMismatch
            ? "The Lisbon baseline requires the owner-approved frozen extractor version. No vendor calls were made."
            : "The Lisbon baseline failed. Review Trigger.dev logs before retrying."},
          finished_at = now(), updated_at = now()
        where id = ${jobId}
      `;
      throw error;
    } finally {
      await closeDb();
    }
  },
});
