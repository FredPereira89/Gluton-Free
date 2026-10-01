import { db } from "@/lib/db";
import { sendDatabaseSizeWarning } from "@/lib/push-send";

export const DATABASE_SIZE_WARNING_BYTES = 350_000_000;

export async function recordDatabaseSize(sampledAt: Date): Promise<{
  sampledAt: string;
  sizeBytes: number;
  aboveThreshold: boolean;
  warningRaised: boolean;
} | { sampledAt: string; duplicate: true }> {
  const sql = db();
  const [measurement] = await sql`select pg_database_size(current_database())::bigint as size_bytes`;
  if (!measurement) throw new Error("Postgres did not return the current database size");
  const sizeBytes = Number(measurement.size_bytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw new Error("Postgres returned an invalid database size");
  const aboveThreshold = sizeBytes > DATABASE_SIZE_WARNING_BYTES;

  const [sample] = await sql`
    with previous_sample as (
      select size_bytes from database_size_sample
      where sampled_at < ${sampledAt}
      order by sampled_at desc limit 1
    ), inserted_sample as (
      insert into database_size_sample (sampled_at, size_bytes, above_threshold)
      values (${sampledAt}, ${sizeBytes}, ${aboveThreshold})
      on conflict (sampled_at) do nothing
      returning size_bytes, above_threshold
    )
    select inserted_sample.size_bytes, inserted_sample.above_threshold,
      (inserted_sample.above_threshold and
        (previous_sample.size_bytes is null or previous_sample.size_bytes <= ${DATABASE_SIZE_WARNING_BYTES})
      ) as warning_raised
    from inserted_sample left join previous_sample on true`;

  if (!sample) return { sampledAt: sampledAt.toISOString(), duplicate: true };

  const recordedBytes = Number(sample.size_bytes);
  const recordedAboveThreshold = Boolean(sample.above_threshold);
  const warningRaised = Boolean(sample.warning_raised);
  console.info("Weekly database size recorded", {
    sampledAt: sampledAt.toISOString(), sizeBytes: recordedBytes, aboveThreshold: recordedAboveThreshold,
  });
  if (recordedAboveThreshold) {
    console.warn("Database size is above 350 MB", { sizeBytes: recordedBytes, thresholdBytes: DATABASE_SIZE_WARNING_BYTES });
  }
  if (warningRaised) {
    try {
      await sendDatabaseSizeWarning(recordedBytes);
    } catch (error) {
      console.error("Database size warning push failed", error);
    }
  }

  return {
    sampledAt: sampledAt.toISOString(), sizeBytes: recordedBytes,
    aboveThreshold: recordedAboveThreshold, warningRaised,
  };
}
