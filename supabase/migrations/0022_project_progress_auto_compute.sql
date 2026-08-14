-- Project Charters get a cached, auto-computed overall progress: the share
-- of its Milestones (the project's "subtasks") marked Completed. A
-- cross-table aggregate like this can't be a generated column (Postgres
-- generated columns may only reference the same row), so it's maintained by
-- a trigger on milestones instead, recomputed after every milestone
-- insert/update/delete.
alter table public.project_charters add column overall_progress_percent numeric
  check (overall_progress_percent is null or (overall_progress_percent >= 0 and overall_progress_percent <= 100));

create or replace function public.recompute_project_progress(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_status_id uuid;
  total_count integer;
  completed_count integer;
begin
  select id into completed_status_id
  from public.lookup_options
  where list_key = 'milestone_status' and value = 'Completed'
  limit 1;

  select count(*), count(*) filter (where status_id = completed_status_id)
    into total_count, completed_count
  from public.milestones
  where project_id = p_project_id;

  update public.project_charters
  set overall_progress_percent = case
    when total_count = 0 then null
    else round((completed_count::numeric / total_count) * 100, 2)
  end
  where id = p_project_id;
end;
$$;

create or replace function public.trg_recompute_project_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_project_progress(old.project_id);
    return old;
  end if;

  perform public.recompute_project_progress(new.project_id);
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    perform public.recompute_project_progress(old.project_id);
  end if;
  return new;
end;
$$;

create trigger trg_milestones_recompute_project_progress
  after insert or update or delete on public.milestones
  for each row execute function public.trg_recompute_project_progress();

-- Backfill: projects that already exist (and any of their existing
-- milestones) get a correct overall_progress_percent immediately, not just
-- going forward.
do $$
declare
  proj record;
begin
  for proj in select id from public.project_charters loop
    perform public.recompute_project_progress(proj.id);
  end loop;
end;
$$;
