-- Procurement Activity: records which Mode of Procurement a Requisition
-- goes through and when. Deliberately its own entity rather than fields
-- bolted onto RFQs -- the user's own framing was "the mode of procurement
-- will decide what next, we will revise the process": Public Bidding
-- implies a formal RFQ, but Simplified/Shopping are meant to skip straight
-- past bidding, so an RFQ-only field would force every mode through a
-- bidding-shaped screen even when there's no actual bid. This table is step
-- one (the record of which mode + when); the branching logic that acts on
-- the mode is intentionally not built yet, per the user's own call to
-- revisit the process separately.
create table public.procurement_activities (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique check (code ~ '^PRC-ACT-[0-9]{6}$'),
  requisition_id uuid not null references public.purchase_requisitions(id) on delete cascade,
  mode_id uuid not null references public.lookup_options(id),
  activity_date date not null,
  notes text,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_procurement_activities_requisition_id on public.procurement_activities(requisition_id);
create index idx_procurement_activities_mode_id on public.procurement_activities(mode_id);
create index idx_procurement_activities_owner_id on public.procurement_activities(owner_id);

alter table public.procurement_activities enable row level security;

-- Matches the current (post-migration 0033) access model: open read,
-- editor-gated write -- not the older owner_id-scoped pattern earlier
-- tables use, since this table is new and viewer/editor is now the
-- standing convention.
create policy procurement_activities_select on public.procurement_activities
  for select to authenticated using (true);
create policy procurement_activities_insert on public.procurement_activities
  for insert to authenticated with check (public.is_editor());
create policy procurement_activities_update on public.procurement_activities
  for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy procurement_activities_delete on public.procurement_activities
  for delete to authenticated using (public.is_editor());

create trigger trg_procurement_activities_updated_at
  before update on public.procurement_activities
  for each row execute function public.set_updated_at();

-- Mode of Procurement lookup list -- the three examples given. Easy to
-- rename/add more later through the same lookup_options list every other
-- status/category field in this app already uses.
insert into public.lookup_options (list_key, code, value, tone, is_terminal, owner_id)
select 'procurement_mode', v.code, v.value, 'neutral', false, (select owner_id from public.lookup_options limit 1)
from (values
  ('PRCM-0001', 'Public Bidding'),
  ('PRCM-0002', 'Simplified'),
  ('PRCM-0003', 'Shopping')
) as v(code, value)
where exists (select 1 from public.lookup_options)
  and not exists (
    select 1 from public.lookup_options existing
    where existing.list_key = 'procurement_mode' and existing.code = v.code
  );
