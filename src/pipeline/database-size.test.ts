import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { sendDatabaseSizeWarning } from "@/lib/push-send";
import { recordDatabaseSize } from "@/pipeline/database-size";

vi.mock("@/lib/db", () => ({ db: vi.fn() }));
vi.mock("@/lib/push-send", () => ({ sendDatabaseSizeWarning: vi.fn() }));

const query = vi.fn();
const sampledAt = new Date("2026-10-04T02:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db).mockReturnValue(query as unknown as ReturnType<typeof db>);
});

describe("recordDatabaseSize", () => {
  it("records the database size and warns when a new sample crosses 350 MB", async () => {
    query.mockImplementation((strings: TemplateStringsArray) => {
      const statement = strings.join(" ");
      if (statement.includes("pg_database_size")) return Promise.resolve([{ size_bytes: "350000001" }]);
      if (statement.includes("insert into database_size_sample")) return Promise.resolve([{
        size_bytes: "350000001", above_threshold: true, warning_raised: true,
      }]);
      throw new Error(`Unexpected query: ${statement}`);
    });

    await expect(recordDatabaseSize(sampledAt)).resolves.toEqual({
      sampledAt: sampledAt.toISOString(), sizeBytes: 350_000_001, aboveThreshold: true, warningRaised: true,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1]![0]!.join(" "))).toContain("on conflict (sampled_at) do nothing");
    expect(sendDatabaseSizeWarning).toHaveBeenCalledWith(350_000_001);
  });

  it("records continued overage without sending the same warning again", async () => {
    query.mockImplementation((strings: TemplateStringsArray) => {
      const statement = strings.join(" ");
      if (statement.includes("pg_database_size")) return Promise.resolve([{ size_bytes: "360000000" }]);
      if (statement.includes("insert into database_size_sample")) return Promise.resolve([{
        size_bytes: "360000000", above_threshold: true, warning_raised: false,
      }]);
      throw new Error(`Unexpected query: ${statement}`);
    });

    await expect(recordDatabaseSize(sampledAt)).resolves.toMatchObject({ aboveThreshold: true, warningRaised: false });
    expect(sendDatabaseSizeWarning).not.toHaveBeenCalled();
  });

  it("does not record a duplicate scheduled run", async () => {
    query.mockImplementation((strings: TemplateStringsArray) => {
      const statement = strings.join(" ");
      if (statement.includes("pg_database_size")) return Promise.resolve([{ size_bytes: "360000000" }]);
      if (statement.includes("insert into database_size_sample")) return Promise.resolve([]);
      throw new Error(`Unexpected query: ${statement}`);
    });

    await expect(recordDatabaseSize(sampledAt)).resolves.toEqual({
      sampledAt: sampledAt.toISOString(), duplicate: true,
    });
    expect(sendDatabaseSizeWarning).not.toHaveBeenCalled();
  });
});
