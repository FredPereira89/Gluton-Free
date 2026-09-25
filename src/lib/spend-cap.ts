import { db } from "./db";

export const DEFAULT_VENDOR_DAILY_CAP_USD = 3;

export function dailyCapUsd(): number {
  const raw = Number(process.env.VENDOR_DAILY_CAP_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_VENDOR_DAILY_CAP_USD;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function todayUtcDateString(): string {
  return startOfTodayUtc().toISOString().slice(0, 10);
}

export type SpendCapStatus = { atCap: boolean; resetAt: string };

/** Today's vendor spend is the job ledger's totals for jobs started today plus the search-cost counter. */
export async function spendCapStatus(): Promise<SpendCapStatus> {
  const start = startOfTodayUtc();
  const day = todayUtcDateString();
  const [row] = await db()`
    select
      (select coalesce(sum(vendor_cost_usd), 0) from job where created_at >= ${start.toISOString()}) as job_usd,
      (select coalesce(cost_usd, 0) from search_cost_daily where day = ${day}) as search_usd`;
  const spent = Number(row!.job_usd) + Number(row!.search_usd);
  return { atCap: spent >= dailyCapUsd(), resetAt: new Date(start.getTime() + MS_PER_DAY).toISOString() };
}

export async function recordSearchCost(usd: number): Promise<void> {
  if (!(usd > 0)) return;
  const day = todayUtcDateString();
  await db()`
    insert into search_cost_daily (day, cost_usd) values (${day}, ${usd})
    on conflict (day) do update set cost_usd = search_cost_daily.cost_usd + excluded.cost_usd`;
}
