-- Two-tier access: viewer (read-only) vs editor (full read/write, including
-- what today are separate "approve" style status edits -- there's no
-- distinct approve action in the app yet, it's just another field an editor
-- can set). profiles.role already existed (analyst/manager/approver/admin)
-- but was never read by any policy -- replaced with a clean two-value role
-- instead of wiring up the unused four-value one.
--
-- Design choice: an editor can write ANY row, not just rows they created.
-- Today's write policies are ownership-scoped (owner_id = auth.uid()), which
-- is a different axis than view/edit -- collapsing edit rights onto "did you
-- personally create this row" doesn't match a real review/approval workflow
-- where one editor enters a requisition and another approves the PO. This
-- broadens what any single editor can touch; acceptable since editors are
-- meant to be the trusted/staff tier and this is still test data.

create or replace function public.is_editor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'editor'
  );
$$;

-- profiles.role: migrate the value domain first (grandfather every existing
-- account to editor so nobody active loses access), then tighten the check
-- constraint, then flip the default for brand-new signups to the safer
-- least-privilege value.
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'editor';
alter table public.profiles alter column role set default 'viewer';
alter table public.profiles add constraint profiles_role_check check (role in ('viewer', 'editor'));

-- Guard against a viewer self-promoting: profiles_update_self (below) lets
-- any user update their own row (name, etc.), so without this a viewer
-- could just PATCH their own role via the API. Only let a role change
-- through if the actor is already an editor; otherwise silently keep it.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_editor() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_role_change on public.profiles;
create trigger trg_guard_profile_role_change before update on public.profiles
  for each row execute function public.guard_profile_role_change();

-- Editors can manage everyone's role (profiles_update_self only covers your
-- own row), so there's an actual path to promote a viewer without going
-- into the Supabase dashboard.
drop policy if exists profiles_update_by_editor on public.profiles;
create policy profiles_update_by_editor on public.profiles for update to authenticated
  using (public.is_editor()) with check (public.is_editor());

-- Redefine every owns_*() helper to check the role instead of ownership --
-- this alone re-points every child-table policy that already calls one of
-- these (bidding_schedule_activities, purchase_requisition_lines, vendor
-- bid line quotes, etc.) without having to touch each policy individually.
create or replace function public.owns_approval_matrix(p_matrix_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

create or replace function public.owns_asset_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

create or replace function public.owns_bom(p_bom_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

create or replace function public.owns_financial_tracking(p_tracking_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

create or replace function public.owns_milestone(p_milestone_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

create or replace function public.owns_procurement_item(p_item_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

create or replace function public.owns_project_charter(p_charter_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

create or replace function public.owns_purchase_order(p_po_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

create or replace function public.owns_purchase_requisition(p_requisition_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

create or replace function public.owns_rfq(p_bidding_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

create or replace function public.owns_rfq_checklist_item(p_checklist_item_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

create or replace function public.owns_vendor_bid(p_bid_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

create or replace function public.owns_vendor_bidding(p_bidding_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_editor(); $$;

-- The 13 top-level owner-scoped tables: swap owner_id = auth.uid() for
-- is_editor() on every insert/update/delete policy.
do $$
declare t text;
begin
  foreach t in array array[
    'approval_matrices', 'asset_requests', 'bill_of_materials', 'capex_budgets',
    'financial_tracking', 'lookup_options', 'milestones', 'procurement_items',
    'project_charters', 'purchase_orders', 'purchase_requisitions', 'risk_issue_log',
    'vendor_biddings'
  ]
  loop
    execute format('drop policy if exists %I on public.%I;', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_editor());',
      t || '_insert', t
    );
    execute format('drop policy if exists %I on public.%I;', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_editor()) with check (public.is_editor());',
      t || '_update', t
    );
    execute format('drop policy if exists %I on public.%I;', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_editor());',
      t || '_delete', t
    );
  end loop;
end $$;

-- contractors / vendors were wide open to any authenticated user (no
-- ownership scoping at all) -- gate them to editors too, for consistency.
drop policy if exists contractors_insert on public.contractors;
create policy contractors_insert on public.contractors for insert to authenticated with check (public.is_editor());
drop policy if exists contractors_update on public.contractors;
create policy contractors_update on public.contractors for update to authenticated using (public.is_editor()) with check (public.is_editor());

drop policy if exists vendors_insert on public.vendors;
create policy vendors_insert on public.vendors for insert to authenticated with check (public.is_editor());
drop policy if exists vendors_update on public.vendors;
create policy vendors_update on public.vendors for update to authenticated using (public.is_editor()) with check (public.is_editor());
