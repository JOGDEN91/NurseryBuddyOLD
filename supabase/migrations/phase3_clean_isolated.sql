-- Phase 3: Clean isolated tables to avoid collisions

-- 1) app_profiles
create table if not exists public.app_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'parent' check (role in ('parent','staff')),
  nursery_id uuid,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.app_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists app_trg_profiles_updated_at on public.app_profiles;
create trigger app_trg_profiles_updated_at before update on public.app_profiles
for each row execute function public.app_set_updated_at();

-- auto insert on new auth user
create or replace function public.app_handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.app_profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists app_on_auth_user_created on auth.users;
create trigger app_on_auth_user_created
  after insert on auth.users
  for each row execute function public.app_handle_new_user();

alter table public.app_profiles enable row level security;

drop policy if exists "app_profiles: self read" on public.app_profiles;
create policy "app_profiles: self read"
  on public.app_profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "app_profiles: self insert" on public.app_profiles;
create policy "app_profiles: self insert"
  on public.app_profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "app_profiles: self update (no role change)" on public.app_profiles;
create policy "app_profiles: self update (no role change)"
  on public.app_profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.app_profiles where id = auth.uid())
  );

-- 2) app_reminders (placeholder for later phases)
create table if not exists public.app_reminders (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  assignee_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  due_at timestamptz not null,
  repeat_rule text,
  status text not null default 'pending' check (status in ('pending','done','snoozed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists app_trg_reminders_updated_at on public.app_reminders;
create trigger app_trg_reminders_updated_at before update on public.app_reminders
for each row execute function public.app_set_updated_at();

alter table public.app_reminders enable row level security;

-- basic read policies (we'll expand later)
drop policy if exists "app_reminders: read self" on public.app_reminders;
create policy "app_reminders: read self" on public.app_reminders
  for select to authenticated using (assignee_id = auth.uid());

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

-- 3) app_files (placeholder for later phases)
create table if not exists public.app_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references auth.users(id),
  nursery_id uuid,
  bucket text not null,
  path text not null,
  mime_type text,
  bytes bigint,
  label text,
  created_at timestamptz not null default now()
);

alter table public.app_files enable row level security;

drop policy if exists "app_files: read" on public.app_files;
create policy "app_files: read" on public.app_files
  for select to authenticated
  using (
    owner_id = auth.uid()
    or subject_id = auth.uid()
    or exists (
      select 1 from public.app_profiles p_staff
      where p_staff.id = auth.uid()
        and p_staff.role = 'staff'
        and p_staff.nursery_id is not distinct from public.app_files.nursery_id
    )
  );

drop policy if exists "app_files: insert self" on public.app_files;
create policy "app_files: insert self" on public.app_files
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "app_files: delete own or staff same nursery" on public.app_files;
create policy "app_files: delete own or staff same nursery" on public.app_files
  for delete to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.app_profiles p_staff
      where p_staff.id = auth.uid()
        and p_staff.role = 'staff'
        and p_staff.nursery_id is not distinct from public.app_files.nursery_id
    )
  );

-- 4) Backfill a profile row for any existing users
insert into public.app_profiles (id)
select u.id
from auth.users u
left join public.app_profiles p on p.id = u.id
where p.id is null;
