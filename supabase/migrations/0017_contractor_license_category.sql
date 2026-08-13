-- =============================================================================
-- Migration 0017 -- contractor license category (PCAB classification)
-- =============================================================================
-- Adds a license/classification category to contractors -- the Philippine
-- Contractors Accreditation Board (PCAB) classifies contractors AAA (largest,
-- unlimited allowable range of contract cost) down through AA, A, B, C, D, to
-- Trade (specialty trades only). Modeled the same way every other
-- status/category field in this schema is: a lookup_options list plus a
-- nullable *_id FK, not a hardcoded CHECK enum, so the category list stays
-- editable without a migration if PCAB's brackets change.
-- =============================================================================

insert into public.lookup_options (list_key, code, value, owner_id)
select 'contractor_license_category', v.code, v.value, (select id from auth.users order by created_at asc limit 1)
from (values
  ('CLCAT-0001', 'AAA'),
  ('CLCAT-0002', 'AA'),
  ('CLCAT-0003', 'A'),
  ('CLCAT-0004', 'B'),
  ('CLCAT-0005', 'C'),
  ('CLCAT-0006', 'D'),
  ('CLCAT-0007', 'Trade')
) as v(code, value)
where not exists (select 1 from public.lookup_options lo where lo.list_key = 'contractor_license_category' and lo.value = v.value)
  and exists (select 1 from auth.users);

alter table public.contractors
  add column if not exists license_category_id uuid references public.lookup_options (id) on delete set null;

create index if not exists idx_contractors_license_category on public.contractors (license_category_id);
