-- Bills of Materials get a cached, auto-computed estimated total: the sum of
-- their parts list's Extended Cost (bill_of_materials_lines.estimated_total_cost,
-- itself quantity * estimated_unit_cost -- see migration 0019). Surfacing
-- this on the BOM list itself (not just inside each BOM's own parts-list
-- footer) needs it as a real column on bill_of_materials, since the list
-- view is a plain `select *` on that table with no per-row aggregate query.
-- A cross-table sum like this can't be a generated column (Postgres
-- generated columns may only reference the same row), so it's maintained by
-- a trigger on bill_of_materials_lines instead, recomputed after every
-- line insert/update/delete -- same approach as project_charters'
-- overall_progress_percent (migration 0022).

alter table public.bill_of_materials add column estimated_total_cost numeric
  check (estimated_total_cost is null or estimated_total_cost >= 0);

create or replace function public.recompute_bom_total(p_bom_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  line_count integer;
  total numeric;
begin
  select count(*), sum(estimated_total_cost)
    into line_count, total
  from public.bill_of_materials_lines
  where bom_id = p_bom_id;

  update public.bill_of_materials
  set estimated_total_cost = case
    when line_count = 0 then null
    else total
  end
  where id = p_bom_id;
end;
$$;

create or replace function public.trg_recompute_bom_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_bom_total(old.bom_id);
    return old;
  end if;

  perform public.recompute_bom_total(new.bom_id);
  if tg_op = 'UPDATE' and old.bom_id is distinct from new.bom_id then
    perform public.recompute_bom_total(old.bom_id);
  end if;
  return new;
end;
$$;

create trigger trg_bom_lines_recompute_total
  after insert or update or delete on public.bill_of_materials_lines
  for each row execute function public.trg_recompute_bom_total();

-- Backfill: BOMs that already exist (and any of their existing lines) get a
-- correct estimated_total_cost immediately, not just going forward.
do $$
declare
  b record;
begin
  for b in select id from public.bill_of_materials loop
    perform public.recompute_bom_total(b.id);
  end loop;
end;
$$;
