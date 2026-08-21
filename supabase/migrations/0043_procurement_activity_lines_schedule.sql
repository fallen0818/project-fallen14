-- Activity/Date/Status move off the top-level Procurement Activity record
-- and into a repeatable "+ Add Line" schedule -- one Procurement Activity
-- record (still keyed to one Requisition + Mode of Procurement) can now
-- list several steps (Pre-bid Conference, Bid Opening, Award...) instead
-- of needing a separate top-level record per step. Per the user's own
-- call, Status moves with it (per-line, not a single record-wide status);
-- Bid Evaluation and Post-Qualification now identify a Procurement Activity
-- by its code + Requisition + Mode instead of an Activity name.

create table public.procurement_activity_lines (
  id uuid primary key default uuid_generate_v4(),
  procurement_activity_id uuid not null references public.procurement_activities(id) on delete cascade,
  activity text not null,
  activity_date date not null,
  status_id uuid not null references public.lookup_options(id),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_procurement_activity_lines_procurement_activity_id on public.procurement_activity_lines(procurement_activity_id);
create index idx_procurement_activity_lines_status_id on public.procurement_activity_lines(status_id);

alter table public.procurement_activity_lines enable row level security;
create policy procurement_activity_lines_select on public.procurement_activity_lines for select to authenticated using (true);
create policy procurement_activity_lines_insert on public.procurement_activity_lines for insert to authenticated with check (public.is_editor());
create policy procurement_activity_lines_update on public.procurement_activity_lines for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy procurement_activity_lines_delete on public.procurement_activity_lines for delete to authenticated using (public.is_editor());

create trigger trg_procurement_activity_lines_updated_at
  before update on public.procurement_activity_lines
  for each row execute function public.set_updated_at();

-- Backfill: carry each existing record's own Activity/Date/Status into its
-- first schedule line, so nothing already entered is lost.
insert into public.procurement_activity_lines (procurement_activity_id, activity, activity_date, status_id)
select id, activity, activity_date, status_id
from public.procurement_activities;

alter table public.procurement_activities drop column activity;
alter table public.procurement_activities drop column activity_date;
alter table public.procurement_activities drop column status_id;
