-- Add staff read-by-nursery select policy (if not present)
alter table public.app_reminders enable row level security;

-- self read (keep/ensure)
drop policy if exists "app_reminders: read self" on public.app_reminders;
create policy "app_reminders: read self" on public.app_reminders
  for select to authenticated using (assignee_id = auth.uid());

-- staff read by nursery
drop policy if exists "app_reminders: staff read by nursery" on public.app_reminders;
create policy "app_reminders: staff read by nursery" on public.app_reminders
  for select to authenticated
  using (
    exists (
      select 1
      from public.app_profiles p_staff
      join public.app_profiles p_assignee on p_assignee.id = public.app_reminders.assignee_id
      where p_staff.id = auth.uid()
        and p_staff.role = 'staff'
        and p_assignee.nursery_id is not distinct from p_staff.nursery_id
    )
  );

-- insert (keep/ensure) — parent self or staff same nursery
drop policy if exists "app_reminders: insert self or staff same nursery" on public.app_reminders;
create policy "app_reminders: insert self or staff same nursery" on public.app_reminders
  for insert to authenticated
  with check (
    creator_id = auth.uid()
    and (
      assignee_id = auth.uid()
      or exists (
        select 1
        from public.app_profiles p_creator
        join public.app_profiles p_assignee on p_assignee.id = public.app_reminders.assignee_id
        where p_creator.id = auth.uid()
          and p_creator.role = 'staff'
          and p_assignee.nursery_id is not distinct from p_creator.nursery_id
      )
    )
  );

-- update (toggle, edits) — own or staff same nursery
drop policy if exists "app_reminders: update own or staff same nursery" on public.app_reminders;
create policy "app_reminders: update own or staff same nursery" on public.app_reminders
  for update to authenticated
  using (
    auth.uid() in (creator_id, assignee_id)
    or exists (
      select 1 from public.app_profiles p_staff
      join public.app_profiles p_assignee on p_assignee.id = public.app_reminders.assignee_id
      where p_staff.id = auth.uid()
        and p_staff.role = 'staff'
        and p_staff.nursery_id is not distinct from p_assignee.nursery_id
    )
  )
  with check (true);

-- delete — own or staff same nursery
drop policy if exists "app_reminders: delete own or staff same nursery" on public.app_reminders;
create policy "app_reminders: delete own or staff same nursery" on public.app_reminders
  for delete to authenticated
  using (
    auth.uid() in (creator_id, assignee_id)
    or exists (
      select 1 from public.app_profiles p_staff
      join public.app_profiles p_assignee on p_assignee.id = public.app_reminders.assignee_id
      where p_staff.id = auth.uid()
        and p_staff.role = 'staff'
        and p_staff.nursery_id is not distinct from p_assignee.nursery_id
    )
  );
