-- New standalone Post-Qualification module -- the RA 9184 step after Bid
-- Evaluation and before Award/PO: verify the winning bidder's legal/
-- technical/financial documents, run a site/equipment inspection, check
-- financial capacity (NFCC/SLCC), and record a final Passed/Failed
-- decision. Linked back to the Procurement Activity it evaluates, and to
-- the winning supplier or contractor directly (same "one or the other, not
-- both" pattern Purchase Orders already uses) rather than to a specific
-- vendor_bids row -- keeps this independent of Bid Evaluation's own data
-- model, per the user's choice to keep this a standalone module rather
-- than build it into Bid Evaluation or Purchase Orders. Not wired into
-- Purchase Orders as a gate (a PO can still be created regardless of this
-- module's decision) -- same intentionally-unautomated-branching approach
-- as Procurement Activities' own Mode of Procurement (migration 0036).

create table public.post_qualifications (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique check (code ~ '^PRC-PQ-[0-9]{6}$'),
  activity_id uuid not null references public.procurement_activities(id) on delete cascade,
  winning_vendor_id uuid references public.vendors(id) on delete restrict,
  winning_contractor_id uuid references public.contractors(id) on delete restrict,
  nfcc_amount numeric,
  slcc_amount numeric,
  site_inspection_result_id uuid references public.lookup_options(id),
  site_inspection_notes text,
  decision_id uuid not null references public.lookup_options(id),
  decided_by text,
  decision_date date,
  notes text,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_post_qualifications_activity_id on public.post_qualifications(activity_id);
create index idx_post_qualifications_winning_vendor_id on public.post_qualifications(winning_vendor_id);
create index idx_post_qualifications_winning_contractor_id on public.post_qualifications(winning_contractor_id);
create index idx_post_qualifications_site_inspection_result_id on public.post_qualifications(site_inspection_result_id);
create index idx_post_qualifications_decision_id on public.post_qualifications(decision_id);
create index idx_post_qualifications_owner_id on public.post_qualifications(owner_id);

alter table public.post_qualifications enable row level security;
create policy post_qualifications_select on public.post_qualifications for select to authenticated using (true);
create policy post_qualifications_insert on public.post_qualifications for insert to authenticated with check (public.is_editor());
create policy post_qualifications_update on public.post_qualifications for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy post_qualifications_delete on public.post_qualifications for delete to authenticated using (public.is_editor());

create trigger trg_post_qualifications_updated_at
  before update on public.post_qualifications
  for each row execute function public.set_updated_at();

-- Per-document Pass/Fail checklist, scoped to the one winning bidder being
-- post-qualified -- unlike Bid Evaluation's rfq_document_checklist +
-- rfq_checklist_results (which need a many-bidders-per-document join table
-- since every bidder gets marked against the same checklist), a single
-- boolean column on each line is enough here since there's only ever one
-- bidder in play.
create table public.post_qualification_checklist (
  id uuid primary key default uuid_generate_v4(),
  post_qualification_id uuid not null references public.post_qualifications(id) on delete cascade,
  section text not null,
  document_name text not null,
  passed boolean not null default false,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_post_qualification_checklist_post_qualification_id on public.post_qualification_checklist(post_qualification_id);

alter table public.post_qualification_checklist enable row level security;
create policy post_qualification_checklist_select on public.post_qualification_checklist for select to authenticated using (true);
create policy post_qualification_checklist_insert on public.post_qualification_checklist for insert to authenticated with check (public.is_editor());
create policy post_qualification_checklist_update on public.post_qualification_checklist for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy post_qualification_checklist_delete on public.post_qualification_checklist for delete to authenticated using (public.is_editor());

create trigger trg_post_qualification_checklist_updated_at
  before update on public.post_qualification_checklist
  for each row execute function public.set_updated_at();

-- Site/equipment inspection result -- separate from the overall Decision
-- below since some procurements (e.g. simple goods) skip inspection
-- entirely (Not Applicable), which shouldn't itself fail the bidder.
insert into public.lookup_options (list_key, code, value, tone, is_terminal, owner_id)
select 'post_qualification_result', v.code, v.value, v.tone, v.is_terminal, (select owner_id from public.lookup_options limit 1)
from (values
  ('PQR-0001', 'Passed', 'success', true),
  ('PQR-0002', 'Failed', 'error', true),
  ('PQR-0003', 'Not Applicable', 'neutral', true)
) as v(code, value, tone, is_terminal)
where exists (select 1 from public.lookup_options)
  and not exists (
    select 1 from public.lookup_options existing
    where existing.list_key = 'post_qualification_result' and existing.code = v.code
  );

-- Overall Post-Qualification decision -- starts Pending, resolves to
-- Passed/Failed once the checklist, inspection, and financial capacity are
-- all reviewed.
insert into public.lookup_options (list_key, code, value, tone, is_terminal, owner_id)
select 'post_qualification_status', v.code, v.value, v.tone, v.is_terminal, (select owner_id from public.lookup_options limit 1)
from (values
  ('PQST-0001', 'Pending', 'neutral', false),
  ('PQST-0002', 'Passed', 'success', true),
  ('PQST-0003', 'Failed', 'error', true)
) as v(code, value, tone, is_terminal)
where exists (select 1 from public.lookup_options)
  and not exists (
    select 1 from public.lookup_options existing
    where existing.list_key = 'post_qualification_status' and existing.code = v.code
  );
