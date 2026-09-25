-- Issue #52: the home screen's Activity list needs to tell a new, unopened Verdict
-- ("Ready (new)") apart from one the owner has already seen.
alter table restaurant add column seen_verdict_id bigint references verdict (id);
