-- Procurement Activity gains its own Activity (what step, e.g. "Pre-bid
-- Conference", "Opening of Bids" -- free text, same idea as
-- bidding_schedule_activities.activity) and Status (progress of that step),
-- alongside the existing Mode of Procurement + Date of Activities. No
-- existing rows yet, so both can go in as required with no backfill.

alter table public.procurement_activities add column if not exists activity text not null default '';
alter table public.procurement_activities alter column activity drop default;

alter table public.procurement_activities add column if not exists status_id uuid references public.lookup_options(id);
create index if not exists idx_procurement_activities_status_id on public.procurement_activities(status_id);

-- Same shape as bidding_schedule_activities' own status list
-- (bidding_activity_status) -- a fresh list rather than reusing that one,
-- since Procurement Activity is a distinct entity and its statuses should
-- be renameable independently later.
insert into public.lookup_options (list_key, code, value, tone, is_terminal, owner_id)
select 'procurement_activity_status', v.code, v.value, v.tone, v.is_terminal, (select owner_id from public.lookup_options limit 1)
from (values
  ('PAST-0001', 'Pending', 'neutral', false),
  ('PAST-0002', 'In Progress', 'info', false),
  ('PAST-0003', 'Completed', 'success', true),
  ('PAST-0004', 'Delayed', 'warning', false),
  ('PAST-0005', 'Cancelled', 'error', true)
) as v(code, value, tone, is_terminal)
where exists (select 1 from public.lookup_options)
  and not exists (
    select 1 from public.lookup_options existing
    where existing.list_key = 'procurement_activity_status' and existing.code = v.code
  );

-- No existing rows, so this can go straight to not null (matching how every
-- other required *_id status field in this app is enforced at the DB level).
alter table public.procurement_activities alter column status_id set not null;
