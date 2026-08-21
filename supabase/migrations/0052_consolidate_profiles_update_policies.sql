-- profiles had two permissive UPDATE policies for the `authenticated` role
-- (profiles_update_by_editor: is_editor(); profiles_update_self: auth.uid() = id).
-- Multiple permissive policies for the same role/action are OR'd together by
-- Postgres anyway, so this was already equivalent to one combined policy --
-- just evaluated twice per row. Consolidating is a pure performance fix,
-- semantics unchanged (per the Supabase performance advisor's
-- multiple_permissive_policies WARN).
drop policy if exists profiles_update_by_editor on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_editor() or (select auth.uid()) = id)
  with check (public.is_editor() or (select auth.uid()) = id);
