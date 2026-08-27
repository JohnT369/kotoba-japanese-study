-- KOTOBA account and cross-device learning-progress foundation.
-- This migration is idempotent where practical and is safe to apply once to a
-- new Supabase project. Authentication users remain owned by auth.users.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_display_name_length check (display_name is null or char_length(display_name) between 1 and 80)
);

create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null check (char_length(lesson_id) between 1 and 160),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  started_at timestamptz,
  last_visited_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, lesson_id),
  constraint lesson_progress_completed_time check (
    status <> 'completed' or completed_at is not null
  )
);

create index if not exists lesson_progress_user_last_visited_idx
  on public.lesson_progress (user_id, last_visited_at desc nulls last);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists lesson_progress_set_updated_at on public.lesson_progress;
create trigger lesson_progress_set_updated_at
before update on public.lesson_progress
for each row execute procedure public.set_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.lesson_progress enable row level security;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.lesson_progress to authenticated;

drop policy if exists "Profiles are visible only to their owner" on public.profiles;
create policy "Profiles are visible only to their owner"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Profiles can be updated only by their owner" on public.profiles;
create policy "Profiles can be updated only by their owner"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users manage only their own lesson progress" on public.lesson_progress;
create policy "Users manage only their own lesson progress"
  on public.lesson_progress for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
