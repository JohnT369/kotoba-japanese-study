-- Keep learner-created lessons and lesson edits private to each authenticated user.

revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;

create table if not exists public.user_course_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  custom_lessons jsonb not null default '[]'::jsonb check (jsonb_typeof(custom_lessons) = 'array'),
  lesson_edits jsonb not null default '{}'::jsonb check (jsonb_typeof(lesson_edits) = 'object'),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists user_course_state_set_updated_at on public.user_course_state;
create trigger user_course_state_set_updated_at
before update on public.user_course_state
for each row execute procedure public.set_updated_at();

alter table public.user_course_state enable row level security;

grant select, insert, update, delete on public.user_course_state to authenticated;

drop policy if exists "Users manage only their own course state" on public.user_course_state;
create policy "Users manage only their own course state"
  on public.user_course_state for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
