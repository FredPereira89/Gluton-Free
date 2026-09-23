// Prints the figures a lookup's resolution records: per-Source counts, storage, the latest
// Verdict's inputs, cost, and a before/after comparison around a given closure window.
// Usage: npx tsx --env-file=.env.local scripts/measure.ts <slug> [closedFrom reopenedOn]
import { closeDb, db } from "../src/lib/db";

const [slug, closedFrom, reopenedOn] = process.argv.slice(2);
if (!slug) {
  console.error("usage: measure.ts <slug> [closedFrom reopenedOn]   (dates as YYYY-MM-DD)");
  process.exit(1);
}

async function main() {
  const sql = db();
  const [r] = await sql`select id from restaurant where slug = ${slug!}`;
  if (!r) throw new Error(`no restaurant ${slug}`);
  const rid = Number(r.id);

  const perSource = await sql`
    select l.source_code, l.fetch_status, l.source_review_count as source_count,
      count(rv.id)::int as stored, count(rv.text)::int as with_text, count(a.review_id)::int as analysed,
      min(rv.published_at)::date as oldest, max(rv.published_at)::date as newest
    from listing l
    left join review rv on rv.listing_id = l.id
    left join review_analysis a on a.review_id = rv.id
    where l.restaurant_id = ${rid}
    group by l.id order by l.source_code`;
  console.log("per Source", perSource);

  const bytes = await sql`
    select (rv.text is not null) as has_text, count(*)::int as n,
      round(avg(pg_column_size(rv.*)))::int as avg_row_bytes
    from review rv join listing l on l.id = rv.listing_id
    where l.restaurant_id = ${rid} group by 1`;
  const analysisBytes = await sql`
    select count(*)::int as n, round(avg(pg_column_size(a.*)))::int as avg_row_bytes
    from review_analysis a join review rv on rv.id = a.review_id join listing l on l.id = rv.listing_id
    where l.restaurant_id = ${rid}`;
  const sizes = await sql`
    select pg_size_pretty(pg_database_size(current_database())) as database,
      pg_size_pretty(pg_total_relation_size('review')) as review_table,
      pg_size_pretty(pg_total_relation_size('review_analysis')) as analysis_table`;
  console.log("bytes", bytes, "analysis", analysisBytes, "sizes", sizes);

  const [v] = await sql`select id, state, tier, confidence, blocks from verdict where restaurant_id = ${rid} order by id desc limit 1`;
  if (v) {
    const blocks = v.blocks as { rollup?: { composite?: number; inputs?: { input: string; theta: number; nEff: number; n: number; weight: number; counted: boolean }[] }; stability?: unknown };
    console.log("verdict", { id: v.id, state: v.state, tier: v.tier, confidence: v.confidence, composite: blocks.rollup?.composite });
    console.table(blocks.rollup?.inputs?.map((i) => ({ input: i.input, theta: +i.theta.toFixed(3), nEff: +i.nEff.toFixed(1), n: i.n, weight: i.weight, counted: i.counted })));
  }

  const jobs = await sql`
    select id, status, step, vendor_cost_usd, llm_usage, created_at, finished_at from job where restaurant_id = ${rid} order by id`;
  for (const j of jobs) {
    const usage = j.llm_usage as { purpose: string; model: string; batch: boolean; requests: number; input_tokens: number; output_tokens: number; cost_usd: number }[];
    console.log(`job ${j.id} ${j.status} (${j.step}) vendor $${j.vendor_cost_usd}`);
    if (usage.length) console.table(usage.map((u) => ({ purpose: u.purpose, model: u.model, batch: u.batch, requests: u.requests, in: u.input_tokens, out: u.output_tokens, usd: +u.cost_usd.toFixed(4) })));
  }

  if (closedFrom && reopenedOn) {
    const cmp = await sql`
      select case when rv.published_at < ${closedFrom}::date then 'before' when rv.published_at >= ${reopenedOn}::date then 'after' else 'closed' end as period,
        l.source_code, count(*)::int as reviews, round(avg(rv.stars), 2) as avg_stars,
        round(100.0 * count(*) filter (where rv.stars <= 2) / count(*), 1) as pct_1_2_stars,
        count(a.review_id)::int as analysed,
        round(avg(a.food), 2) as food, round(avg(a.service), 2) as service, round(avg(a.value), 2) as value,
        round(avg(a.ambience), 2) as ambience, round(avg(a.wait), 2) as wait
      from review rv join listing l on l.id = rv.listing_id
      left join review_analysis a on a.review_id = rv.id
      where l.restaurant_id = ${rid}
      group by 1, 2 order by 2, 1`;
    console.table(cmp.map((c) => ({ ...c })));
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
