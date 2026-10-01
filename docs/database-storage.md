# Database storage monitoring and overflow plan

The `weekly-database-size` Trigger.dev task records `pg_database_size(current_database())` every Sunday at 03:00 Europe/Lisbon in `database_size_sample`. A sample above 350,000,000 bytes is marked over the threshold and written to the Trigger.dev run log. On the first sample above the threshold, Gluton-Free also sends a push warning to subscribed devices. Continued overage is logged weekly without repeating the push; a later crossing after storage falls below the threshold sends a new warning.

## Overflow plan

If storage approaches the 500 MB Supabase Free limit, first null the text of extracted Reviews older than 36 months using the preview and update below. This is a manual action; the scheduled monitor never changes Review data. After the cleanup, the owner decides whether to move to Supabase Pro.

Preview eligible rows before making any change:

```sql
select count(*) as reviews_to_shrink
from review r
where r.text is not null
  and r.published_at < now() - interval '36 months'
  and exists (select 1 from review_analysis a where a.review_id = r.id);
```

After reviewing the count, run this in a transaction:

```sql
begin;

update review r
set text = null
where r.text is not null
  and r.published_at < now() - interval '36 months'
  and exists (select 1 from review_analysis a where a.review_id = r.id);

commit;
```

Only the text column is cleared. The Review rows, analyses and ratings remain available. If the reduced storage is still too close to the Free limit, the owner decides whether to upgrade to Supabase Pro.
