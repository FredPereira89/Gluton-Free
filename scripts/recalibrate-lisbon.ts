// Read-only recalibration and first-snapshot acceptance report. No vendor calls or DB writes.
// Usage: npx tsx --env-file=.env.local scripts/recalibrate-lisbon.ts [output.md]
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { FORMATS } from "@/domain/baseline-format";
import { BASELINE_TARGETS } from "@/pipeline/baseline-build";
import { closeDb, db } from "@/lib/db";
import { loadPeerCandidates } from "@/verdict/snapshot-store";
import { EXCEPTIONAL_POSTERIOR_THRESHOLD, MIN_PEERS, peerGroupKeys, type PeerGroupStat } from "@/verdict/peer";
import {
  CONFIDENCE_DISAGREEMENT_THRESHOLD_POINTS, PARAMS,
  RED_FLAG_AVOID_SHARE_THRESHOLD, RULE_VERSION, type RollupFlag,
} from "@/verdict/rollup";
import { recalibratePeerData, type RecalibrationCandidate } from "@/verdict/recalibration";

type Check = { name: string; status: "PASS" | "FAIL"; evidence: string };

const formatNumber = (value: number, digits = 2) => value.toLocaleString("en-US", { maximumFractionDigits: digits });
const money = (value: number | null) => value === null ? "not recorded" : `$${value.toFixed(2)}`;
const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
const check = (name: string, passed: boolean, evidence: string): Check => ({ name, status: passed ? "PASS" : "FAIL", evidence });
const asObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const numeric = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

function groupForFormat(groups: PeerGroupStat[], city: string, format: string): PeerGroupStat | undefined {
  for (const key of peerGroupKeys(city, format)) {
    const group = groups.find((item) => item.city === city && item.level === key.level && item.key === key.key && item.input === "food");
    if (group && group.peerCount >= MIN_PEERS && group.sortedTheta.length === group.peerCount) return group;
  }
}

function renderShrinkage(groups: PeerGroupStat[]): string {
  if (!groups.length) return "No real Peer data available; k was not fitted.";
  const rows = groups.map((group) =>
    `| ${group.city} | ${group.level} | ${group.key} | ${group.input} | ${group.peerCount} | ${group.k.toFixed(2)} |`,
  );
  return ["| City | Level | Peer group | Input | Peers | k |", "|---|---|---|---|---:|---:|", ...rows].join("\n");
}

function renderAcceptance(checks: Check[]): string {
  return [
    "| # | Acceptance criterion | Result | Evidence |",
    "|---:|---|---|---|",
    ...checks.map((item, index) => `| ${index + 1} | ${item.name} | **${item.status}** | ${item.evidence.replaceAll("|", "\\|")} |`),
  ].join("\n");
}

async function main() {
  const outputPath = resolve(process.argv[2] ?? `docs/recalibration/lisbon-baseline-${new Date().toISOString().slice(0, 10)}.md`);
  const now = new Date();
  const sql = db();
  const [baselineCounts, spotChecks, baselineJob, piiJob, databaseSize, flagRows] = await Promise.all([
    sql`select id, format, count(*) over ()::int as total from restaurant where baseline_sampled and city = 'Lisbon'`,
    sql`select kind, count(*)::int as sample, count(*) filter (where agreed is not null)::int as answered,
        count(*) filter (where agreed = true)::int as correct
      from baseline_spot_check group by kind`,
    sql`select id, vendor_cost_usd, llm_usage, progress, finished_at
      from job where kind = 'baseline' and status = 'succeeded'
        and progress ? 'costsUsd' and progress->'persisted' is not null and progress->'persisted' <> 'null'::jsonb
      order by finished_at desc, id desc limit 1`,
    sql`select id, progress from job where kind = 'baseline' and status = 'succeeded'
      and progress ? 'piiAudit' order by finished_at desc, id desc limit 1`,
    sql`select pg_database_size(current_database())::bigint as bytes`,
    sql`select l.restaurant_id, f.review_id, f.type, f.flag_group, f.first_hand, f.verification, f.severity,
          f.evidence, r.published_at, l.source_code
      from review_flag f join review r on r.id = f.review_id
      join listing l on l.id = r.listing_id
      join restaurant x on x.id = l.restaurant_id
      where x.city = 'Lisbon' and x.status <> 'permanently_closed'`,
  ]);
  const baselineIds = new Set(baselineCounts.map((row) => Number(row.id)));
  const baselineCount = baselineCounts.length ? Number(baselineCounts[0]!.total) : 0;
  const flagByRestaurant = new Map<number, RollupFlag[]>();
  for (const row of flagRows) {
    const id = Number(row.restaurant_id);
    const flags = flagByRestaurant.get(id) ?? [];
    flags.push({
      reviewId: Number(row.review_id), type: row.type as RollupFlag["type"], group: row.flag_group as RollupFlag["group"],
      firstHand: Boolean(row.first_hand), verification: row.verification as RollupFlag["verification"],
      severity: row.severity as RollupFlag["severity"], publishedAt: row.published_at as Date,
      evidence: row.evidence as string, source: row.source_code as string,
    });
    flagByRestaurant.set(id, flags);
  }

  let calibration: ReturnType<typeof recalibratePeerData> | null = null;
  if (baselineCount > 0) {
    const candidates = (await loadPeerCandidates(now)).filter((candidate) => candidate.city === "Lisbon").map((candidate) => ({
      ...candidate,
      baselineSampled: baselineIds.has(candidate.id),
      flags: flagByRestaurant.get(candidate.id) ?? [],
    } satisfies RecalibrationCandidate));
    calibration = recalibratePeerData(candidates, now);
  }

  const job = baselineJob[0];
  const progress = asObject(job?.progress);
  const costs = asObject(progress.costsUsd);
  const extractionAttempts = numeric(progress.extractionAttempts);
  const failedExtractions = numeric(progress.failedExtractions);
  const extractionRate = extractionAttempts && failedExtractions !== null ? failedExtractions / extractionAttempts : null;
  const llmUsage = Array.isArray(job?.llm_usage) ? job.llm_usage as { cost_usd?: number }[] : [];
  const pii = asObject(asObject(piiJob[0]?.progress).piiAudit);
  const auditCost = numeric(pii.costUsd) ?? 0;
  const baselineAnthropicCost = job ? numeric(costs.llm) ?? llmUsage.reduce((sum, item) => sum + (Number(item.cost_usd) || 0), 0) : null;
  const anthropicCost = baselineAnthropicCost === null ? null : baselineAnthropicCost + auditCost;
  const dataForSeoCost = job ? Number(job.vendor_cost_usd) : null;
  const piiSample = numeric(pii.sample);
  const piiFindings = numeric(pii.findingCount);
  const piiReviewerNames = numeric(pii.reviewerNameCount);
  const sizeBytes = Number(databaseSize[0]!.bytes);

  const baselinePeerFormatCounts = new Map<string, number>();
  if (calibration) {
    for (const member of calibration.snapshot.members) {
      if (!baselineIds.has(member.restaurantId)) continue;
      baselinePeerFormatCounts.set(member.format, (baselinePeerFormatCounts.get(member.format) ?? 0) + 1);
    }
  }
  const coverage = FORMATS.map((format) => {
    const target = BASELINE_TARGETS[format];
    const n = baselinePeerFormatCounts.get(format) ?? 0;
    const fallback = calibration ? groupForFormat(calibration.snapshot.groups, "Lisbon", format) : undefined;
    return { format, target, n, fallback };
  });
  const fallbackRecorded = coverage.every(({ target, n, fallback }) =>
    (target !== undefined && n >= target) || Boolean(fallback && (target === undefined || n < target)),
  );

  const formatSpot = spotChecks.find((row) => row.kind === "format");
  const taSpot = spotChecks.find((row) => row.kind === "tripadvisor_match");
  const formatSpotPass = Number(formatSpot?.sample ?? 0) === 50 && Number(formatSpot?.answered ?? 0) === 50 && Number(formatSpot?.correct ?? 0) >= 45;
  const taSpotPass = Number(taSpot?.sample ?? 0) === 30 && Number(taSpot?.answered ?? 0) === 30 && Number(taSpot?.correct ?? 0) >= 29;
  const ruleDecisionComplete = calibration !== null && calibration.ruleRankings.every((result) => !result.rankingReversed);
  const cutoffFit = calibration?.provisionalCutoffs;
  const proposedCutsApplied = Boolean(cutoffFit && Math.abs(PARAMS.goodCut - cutoffFit.proposedGoodCut) < 0.005 &&
    Math.abs(PARAMS.mustGoCut - cutoffFit.proposedMustGoCut) < 0.005);
  const recalibrationRecorded = Boolean(calibration && cutoffFit && ruleDecisionComplete && proposedCutsApplied && !calibration.revisitRedFlagGate);
  const spendRecorded = Boolean(job && dataForSeoCost !== null && anthropicCost !== null);
  const spendsWithin = spendRecorded && dataForSeoCost! <= 50 && anthropicCost! <= 30;
  const checks: Check[] = [
    check("Each Format meets its target Peers or records the selected fallback level", fallbackRecorded,
      baselineCount ? coverage.map(({ format, target, n, fallback }) =>
        `${format}: ${n}${target ? `/${target} Peers` : " Peers (no numeric target)"}${fallback ? `; fallback ${fallback.level} (${fallback.peerCount})` : ""}`,
      ).join("; ") : "No persisted Lisbon baseline Restaurants."),
    check("Owner confirms at least 90% of 50 random baseline Formats", formatSpotPass,
      formatSpot ? `${formatSpot.correct}/${formatSpot.answered} confirmed; sample ${formatSpot.sample}/50` : "No completed Format spot-check."),
    check("At least 95% of 30 Tripadvisor matches are correct", taSpotPass,
      taSpot ? `${taSpot.correct}/${taSpot.answered} correct; sample ${taSpot.sample}/30` : "No completed Tripadvisor spot-check."),
    check("Extraction failures are below 2% of attempted Reviews", extractionRate !== null && extractionRate < 0.02,
      extractionRate === null ? "No baseline extraction counters recorded." : `${failedExtractions}/${extractionAttempts} (${pct(extractionRate)}).`),
    check("A PII audit of 100 random texts finds no reviewer names", piiSample === 100 && piiReviewerNames === 0,
      piiSample === null ? "No baseline PII audit recorded." : `${piiSample} texts; ${piiFindings ?? "?"} personal-name findings; ${piiReviewerNames ?? "?"} reviewer-name findings.`),
    check("Recalibration is recorded; no expected Restaurant Tier is used", recalibrationRecorded,
      !calibration ? "No real Peer sample; recalibration not run." : cutoffFit ?
        `k fitted for ${calibration.shrinkage.length} Peer groups; rule reversal ${calibration.ruleRankings.some((item) => item.rankingReversed) ? "requires review" : "not detected"}; proposed cuts ${cutoffFit.proposedGoodCut}/${cutoffFit.proposedMustGoCut}${proposedCutsApplied ? " applied" : " not yet applied"}.` : "Not enough qualifying Peers to fit cut-offs."),
    check("Forced Avoid applies to no more than 5% of Peers", calibration !== null && calibration.forcedAvoidShare <= 0.05,
      calibration ? `${calibration.forcedAvoidPeers}/${calibration.qualifyingPeers} (${pct(calibration.forcedAvoidShare)}); 1% gate ${RED_FLAG_AVOID_SHARE_THRESHOLD}.` : "No real Peer sample."),
    check("Baseline spend stays within ceilings and database storage stays below 500 MB", Boolean(spendsWithin && sizeBytes < 500_000_000),
      `DataForSEO ${money(dataForSeoCost)} / $50; Anthropic ${money(anthropicCost)} incl. PII audit / $30; database ${(sizeBytes / 1_000_000).toFixed(1)} / 500 MB.`),
  ];

  const shrinkage = calibration ? renderShrinkage(calibration.shrinkage) : "No real Peer data available; k was not fitted.";
  const depths = calibration?.inputDepth.length
    ? ["| Input | Peers | n_eff P25 | Median | P75 |", "|---|---:|---:|---:|---:|", ...calibration.inputDepth.map((item) => `| ${item.input} | ${item.peers} | ${item.nEffP25} | ${item.nEffMedian} | ${item.nEffP75} |`)].join("\n")
    : "No real Peer n_eff available.";
  const rankings = calibration?.ruleRankings.length
    ? ["| Peer group | Peers | Composite vs gates tau-b | Composite vs food-first tau-b | Reversal |", "|---|---:|---:|---:|---|", ...calibration.ruleRankings.map((item) => `| ${item.scope} | ${item.peers} | ${item.weightedVsGatesTau ?? "-"} | ${item.weightedVsFoodFirstTau ?? "-"} | ${item.rankingReversed ? "Yes; review" : "No"} |`)].join("\n")
    : "No real rankings available; no rule change is justified.";
  const provisional = cutoffFit
    ? `Current cuts: ${PARAMS.goodCut}/${PARAMS.mustGoCut}. Suggested cuts: ${cutoffFit.proposedGoodCut}/${cutoffFit.proposedMustGoCut}. Life Changing was grouped into Must Go because provisional Verdicts cannot issue Life Changing. Target shares: ${JSON.stringify(cutoffFit.targetTierShares)}. Current shares: ${JSON.stringify(cutoffFit.currentTierShares)}. Suggested shares: ${JSON.stringify(cutoffFit.proposedTierShares)}; residual ${cutoffFit.residualSharePoints} percentage points.`
    : "No baseline Peer Tier shares available; provisional cut-offs remain unchanged.";
  const redFlagDecision = calibration
    ? calibration.revisitRedFlagGate ? `Revisit the ${pct(RED_FLAG_AVOID_SHARE_THRESHOLD)} gate: it forces Avoid on ${pct(calibration.forcedAvoidShare)} of Peers (the trigger is none or >5%).` : `Keep the ${pct(RED_FLAG_AVOID_SHARE_THRESHOLD)} gate: it forces Avoid on ${pct(calibration.forcedAvoidShare)} of Peers.`
    : `Current gate remains ${pct(RED_FLAG_AVOID_SHARE_THRESHOLD)}; no data supports changing it.`;
  const report = `# Lisbon recalibration and first-snapshot acceptance\n\n` +
    `Generated: ${now.toISOString()}  \n` +
    `Rule version: \`${RULE_VERSION}\`  \n` +
    `Persisted baseline Restaurants: ${baselineCount}  \n` +
    `Snapshot published: no  \n\n` +
    `This check is read-only. It excludes expected Tier labels from every decision and never uses O Velho Eurico's Tier as a criterion. An empty baseline fails the acceptance checks; it does not produce guessed calibration values.\n\n` +
    `## Recalibration\n\n` +
    `- Empirical-Bayes k is fitted by the existing snapshot builder for every available Peer group and input.\n` +
    `- Rule comparison uses real theta/n_eff standings. With no real ground-truth labels, it reports rank agreement (Kendall tau-b); a negative tau is a ranking reversal, and this command does not change the selected rule automatically.\n` +
    `- Confidence disagreement caps: ${CONFIDENCE_DISAGREEMENT_THRESHOLD_POINTS} percentile points for both Source-vs-Source and text-vs-stars.\n` +
    `- Exceptional-language posterior threshold remains ${(EXCEPTIONAL_POSTERIOR_THRESHOLD * 100).toFixed(0)}%.\n` +
    `- ${redFlagDecision}\n` +
    `- Provisional cut-offs: ${provisional}\n` +
    `- Snapshot size: ${calibration ? `${formatNumber(calibration.snapshotBytes)} bytes; ${calibration.snapshotUnderLimit ? "within" : "over"} the 1 MB limit.` : "not calculated."}\n\n` +
    `### Empirical-Bayes shrinkage\n\n${shrinkage}\n\n` +
    `### Real effective sample sizes\n\n${depths}\n\n` +
    `### ADR 0002 ranking comparison\n\n${rankings}\n\n` +
    `## Eight acceptance checks\n\n${renderAcceptance(checks)}\n\n` +
    `## Readiness\n\n` +
    `**${checks.filter((item) => item.status === "PASS").length}/8 pass.** First snapshot publication is not accepted until all eight pass and any reported ranking reversal has an explicit rule decision.\n`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, "utf8");
  console.log(`Wrote ${outputPath}\n${checks.filter((item) => item.status === "PASS").length}/8 acceptance checks pass.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(closeDb);
