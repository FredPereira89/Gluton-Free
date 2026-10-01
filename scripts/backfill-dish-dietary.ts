import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import postgres from "postgres";
import { db, closeDb } from "../src/lib/db";
import { DISH_DIETARY_VERSION, DISH_DIETARY_CHUNK_SIZE, dishDietaryBatchRequests, parseDishDietaryReply } from "../src/analysis/dish-dietary";
import { EXTRACTOR_VERSION } from "../src/analysis/extract";
import { saveDishDietary } from "../src/analysis/dish-dietary-store";
import { advanceDishDietaryBackfill, backfillSpend, excludedBackfillReviewIds, type BackfillLedger, type BackfillPorts } from "../src/analysis/dish-dietary-backfill";
import { anthropic, addUsage, emptyUsage, estimateBatchUpperBound, EXTRACT_MODEL } from "../src/analysis/llm";

// Exact approval phrase avoids treating a discussion of the cap as permission.
const approval = process.argv.find((arg) => arg.startsWith("--approval="))?.slice(11);
const match = approval?.match(/^https:\/\/github\.com\/FredPereira89\/Gluton-Free\/(issues|pull)\/(\d+)#issuecomment-(\d+)$/);
if (!match || (match[1] === "issues" && !["115", "125"].includes(match[2]!))) throw new Error("Provide --approval=<issue #125, #115 or PR Owner comment URL> containing: GO dish-dietary backfill $15");
if (match[1] === "pull") execFileSync("gh", ["api", `repos/FredPereira89/Gluton-Free/pulls/${match[2]}`], { stdio: "pipe" });
const comment = JSON.parse(execFileSync("gh", ["api", `repos/FredPereira89/Gluton-Free/issues/comments/${match[3]}`], { encoding: "utf8" }));
if (comment.user?.login?.toLowerCase() !== "fredpereira89" || comment.issue_url !== `https://api.github.com/repos/FredPereira89/Gluton-Free/issues/${match[2]}` || !/^GO dish-dietary backfill \$15\s*$/im.test(comment.body)) throw new Error("Explicit Owner approval missing from the issue/PR thread");
if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is not set");
// Dedicated connection keeps the session lock for the entire process.
const lock = postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false, idle_timeout: 0 });
try {
  const [row] = await lock`select pg_try_advisory_lock(115, 1) as acquired`;
  if (!row?.acquired) throw new Error("Another dish/dietary backfill runner holds the lock");
  const sql = db();
  const [stored] = await sql`select ledger from dish_dietary_backfill where pass_version = ${DISH_DIETARY_VERSION}`;
  const ledger: BackfillLedger = stored?.ledger ?? { version: DISH_DIETARY_VERSION, approval: approval!, batches: [] };
  const persist: BackfillPorts["persist"] = async (state) => {
    await sql`insert into dish_dietary_backfill (pass_version, ledger) values (${DISH_DIETARY_VERSION}, ${sql.json(state)}) on conflict (pass_version) do update set ledger = excluded.ledger, updated_at = now()`;
  };
  const retryFailed = process.argv.includes("--retry-failed");
  if (!retryFailed && ledger.retryCycleStartBatchCount !== undefined) throw new Error("Retry cycle in progress; resume with --retry-failed");
  if (retryFailed && ledger.retryCycleStartBatchCount === undefined) {
    ledger.retryCycleStartBatchCount = ledger.batches.length;
    ledger.retryCandidateIds = ledger.batches.filter((batch) => batch.costUsd !== undefined).flatMap((batch) => batch.ids);
    await persist(ledger);
  }
  const ports: BackfillPorts = {
    persist,
    pending: async () => {
      const excludedReviewIds = excludedBackfillReviewIds(ledger, retryFailed);
      const rows = await sql`select r.id, r.text from review r
        join review_analysis a on a.review_id = r.id and a.extractor_version = ${EXTRACTOR_VERSION}
        left join review_dish_dietary f on f.review_id = r.id
        where r.text is not null and f.pass_version is distinct from ${DISH_DIETARY_VERSION}
          and not (r.id = any(${sql.array(excludedReviewIds)}::bigint[])) order by r.id limit 1000`;
      return rows.map((r) => ({ id: Number(r.id), text: r.text as string }));
    },
    estimate: (items) => estimateBatchUpperBound(EXTRACT_MODEL, dishDietaryBatchRequests(items).map((r) => r.params.system + r.params.messages[0]!.content + JSON.stringify(r.params.output_config)), 2048),
    submit: async (items) => {
      return (await anthropic().messages.batches.create({ requests: dishDietaryBatchRequests(items) }, { maxRetries: 0 })).id;
    },
    collect: async (batchId, ids) => {
      if ((await anthropic().messages.batches.retrieve(batchId)).processing_status !== "ended") return null;
      const usage = emptyUsage("dish-dietary-backfill", EXTRACT_MODEL, true);
      const results = new Map();
      for await (const entry of await anthropic().messages.batches.results(batchId)) {
        if (entry.result.type !== "succeeded") continue;
        addUsage(usage, entry.result.message.usage);
        const index = Number(entry.custom_id.slice(1));
        if (!Number.isInteger(index) || index < 0) continue;
        const text = entry.result.message.content.find((part) => part.type === "text");
        if (text?.type === "text") for (const result of parseDishDietaryReply(text.text, new Set(ids.slice(index * DISH_DIETARY_CHUNK_SIZE, (index + 1) * DISH_DIETARY_CHUNK_SIZE)))) results.set(result.reviewId, result);
      }
      return { results, usage };
    },
    save: async (results) => {
      if (results.size) await sql`insert into review_dish_dietary (review_id) select unnest(${sql.array([...results.keys()])}::bigint[]) on conflict do nothing`;
      await saveDishDietary(results);
    },
  };
  let status: Awaited<ReturnType<typeof advanceDishDietaryBackfill>>;
  do {
    status = await advanceDishDietaryBackfill(ledger, ports);
    if (status === "submitted" || status === "saved") {
      console.log(JSON.stringify({ status, ...backfillSpend(ledger), batches: ledger.batches.length }));
    } else if (status === "waiting") {
      await sleep(30_000);
    }
  } while (status === "submitted" || status === "saved" || status === "waiting");
  if (retryFailed && ledger.retryCycleStartBatchCount !== undefined) {
    delete ledger.retryCycleStartBatchCount;
    delete ledger.retryCandidateIds;
    await persist(ledger);
  }
  const [coverage] = await sql`select count(*) filter (where f.pass_version = ${DISH_DIETARY_VERSION})::int as completed, count(*) filter (where f.pass_version is distinct from ${DISH_DIETARY_VERSION})::int as pending from review r join review_analysis a on a.review_id = r.id and a.extractor_version = ${EXTRACTOR_VERSION} left join review_dish_dietary f on f.review_id = r.id where r.text is not null`;
  console.log(JSON.stringify({ status: status === "complete" && coverage?.pending > 0 ? "incomplete" : status, ...backfillSpend(ledger), coverage, batches: ledger.batches.length, approval: ledger.approval }));
} finally { await lock.end(); await closeDb(); }
