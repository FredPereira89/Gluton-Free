# Dish and Dietary fit backfill (#125, deferred from #115)

The paid run has not been started. Required Owner approval: post a comment on
https://github.com/FredPereira89/Gluton-Free/issues/125 (or #115 or the implementation PR) with the exact line:

```
GO dish-dietary backfill $15
```

Apply migration `0021_dish_dietary_backfill.sql` using the normal migration procedure.
Then run (with the real issue or PR approval comment URL):

```powershell
npx tsx --env-file=.env.local scripts/backfill-dish-dietary.ts --approval=https://github.com/FredPereira89/Gluton-Free/issues/125#issuecomment-COMMENT_ID
```

The runner submits up to 1,000 Reviews per provider batch, keeps up to 32 batches
in flight within the $15 reserved budget, and polls every 30 seconds. It runs
until status is `complete`, `incomplete`, or `capped`. If interrupted, restart the
same command to resume from the ledger. No Review text is written to the ledger or console. Results
update display facts dynamically; no Verdict re-judging is needed.

The durable ledger is keyed by pass version in `dish_dietary_backfill`. A dedicated
Postgres advisory lock prevents concurrent submissions. Budget reservations include
all input bytes, schema bytes, and maximum output tokens at Batch pricing. Actual
cost comes from returned token usage and the configured model prices. The $15 cap
includes previous actual cost and outstanding reservations. Keep the same model
and pass version throughout this run. Do not delete or reset the ledger.

A crash before the provider batch ID is persisted leaves an unresolved reservation.
Do not submit again. Find the matching batch in Anthropic, verify its request IDs,
and set that reservation's `batchId` in the ledger before resuming. If submission
never reached Anthropic, establish that before removing the reservation. Keep an
audit record of either recovery. Collection and Review saves are idempotent.

Failed/malformed Reviews remain pending. `incomplete` reports attempted Reviews
still without current facts. After inspecting the failure, use `--retry-failed`
to retry pending Reviews under the same cumulative cap. The retry cycle is stored
in the ledger with its eligible Review IDs frozen at the start: restarting the
same command never rebills an already attempted Review in that cycle. Resume an
interrupted retry with `--retry-failed`. A completed retry cycle can be started again only by
deliberately running `--retry-failed` again; this never resets spend.

At completion, report the command's `actualUsd`, coverage (`completed`, `pending`),
and approval URL on the issue/PR. A capped or incomplete run does not fulfil the
backfill acceptance criteria. The issue estimate is $5-10; no actual spend can be
reported until the Owner authorises the run.
