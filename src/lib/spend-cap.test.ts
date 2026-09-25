import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { dailyCapUsd, recordSearchCost, spendCapStatus } from "./spend-cap";

vi.mock("./db", () => ({ db: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.VENDOR_DAILY_CAP_USD;
});

describe("dailyCapUsd", () => {
  it("defaults to $3", () => {
    expect(dailyCapUsd()).toBe(3);
  });

  it("reads VENDOR_DAILY_CAP_USD", () => {
    process.env.VENDOR_DAILY_CAP_USD = "5.5";
    expect(dailyCapUsd()).toBe(5.5);
  });

  it("falls back to the default for a non-positive or invalid value", () => {
    process.env.VENDOR_DAILY_CAP_USD = "0";
    expect(dailyCapUsd()).toBe(3);
    process.env.VENDOR_DAILY_CAP_USD = "not-a-number";
    expect(dailyCapUsd()).toBe(3);
  });
});

describe("spendCapStatus", () => {
  it("is under cap when today's job and search spend are below the cap", async () => {
    vi.mocked(db).mockReturnValue((async () => [{ job_usd: "1.00000", search_usd: "0.50000" }]) as unknown as ReturnType<typeof db>);
    const status = await spendCapStatus();
    expect(status.atCap).toBe(false);
  });

  it("is at cap once today's job and search spend together reach the cap", async () => {
    process.env.VENDOR_DAILY_CAP_USD = "2";
    vi.mocked(db).mockReturnValue((async () => [{ job_usd: "1.50000", search_usd: "0.50000" }]) as unknown as ReturnType<typeof db>);
    const status = await spendCapStatus();
    expect(status.atCap).toBe(true);
  });

  it("resets at the next UTC midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T13:45:00.000Z"));
    vi.mocked(db).mockReturnValue((async () => [{ job_usd: "0", search_usd: "0" }]) as unknown as ReturnType<typeof db>);
    const status = await spendCapStatus();
    expect(status.resetAt).toBe("2026-09-26T00:00:00.000Z");
    vi.useRealTimers();
  });
});

describe("recordSearchCost", () => {
  it("upserts today's search cost", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T13:45:00.000Z"));
    const sql = vi.fn((..._args: [TemplateStringsArray, ...unknown[]]) => Promise.resolve([]));
    vi.mocked(db).mockReturnValue(sql as unknown as ReturnType<typeof db>);
    await recordSearchCost(0.002);
    expect(sql).toHaveBeenCalledTimes(1);
    const strings = sql.mock.calls[0]![0] as TemplateStringsArray;
    expect(strings.join(" ")).toMatch(/insert into search_cost_daily/);
    expect(strings.join(" ")).toMatch(/on conflict \(day\) do update/);
    expect(sql.mock.calls[0]!.slice(1)).toEqual(["2026-09-25", 0.002]);
    vi.useRealTimers();
  });

  it("does nothing for a zero, negative or missing cost", async () => {
    const sql = vi.fn(async () => []);
    vi.mocked(db).mockReturnValue(sql as unknown as ReturnType<typeof db>);
    await recordSearchCost(0);
    await recordSearchCost(-1);
    expect(sql).not.toHaveBeenCalled();
  });
});
