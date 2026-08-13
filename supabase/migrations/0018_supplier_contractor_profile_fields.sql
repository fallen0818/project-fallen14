-- =============================================================================
-- Migration 0018 -- supplier/contractor profile fields
-- =============================================================================
-- Adds address, tax ID (TIN), website, and an active/inactive flag to both
-- vendors (suppliers) and contractors, so the add/edit pop-ups capture a
-- fuller profile. is_active is a soft flag rather than a delete: a supplier
-- or contractor referenced by historical bids/POs shouldn't disappear from
-- that history when they go defunct, they should just stop being offered as
-- a pick for new work -- the same reasoning migration 0014 used for why
-- vendors has no delete policy at all.
--
-- Also adds license_expiry_date to contractors, alongside the existing
-- license_category_id/license_number/insurance_expiry from migrations
-- 0016-0017 -- a PCAB license itself has an expiry, separate from the
-- contractor's insurance policy.
-- =============================================================================

alter table public.vendors
  add column if not exists address text,
  add column if not exists tax_id text,
  add column if not exists website text,
  add column if not exists is_active boolean not null default true;

alter table public.contractors
  add column if not exists address text,
  add column if not exists tax_id text,
  add column if not exists website text,
  add column if not exists is_active boolean not null default true,
  add column if not exists license_expiry_date date;

create index if not exists idx_vendors_is_active on public.vendors (is_active);
create index if not exists idx_contractors_is_active on public.contractors (is_active);
