-- Durable learner-owned state for generated practice, kana mastery and review scheduling.
create table if not exists public.user_learning_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists user_learning_state_set_updated_at on public.user_learning_state;
create trigger user_learning_state_set_updated_at
before update on public.user_learning_state
for each row execute procedure public.set_updated_at();

alter table public.user_learning_state enable row level security;
grant select, insert, update, delete on public.user_learning_state to authenticated;

drop policy if exists "Users manage only their own learning state" on public.user_learning_state;
create policy "Users manage only their own learning state"
  on public.user_learning_state for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Shared daily quota, consumed atomically by the server with the caller's JWT.
create table if not exists public.ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);

alter table public.ai_usage_daily enable row level security;
revoke all on public.ai_usage_daily from anon, authenticated;

create or replace function public.consume_ai_quota(max_requests integer default 40)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
  capped_limit integer := greatest(1, least(max_requests, 40));
begin
  if auth.uid() is null then
    return false;
  end if;

  insert into public.ai_usage_daily (user_id, usage_date, request_count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, usage_date) do update
    set request_count = public.ai_usage_daily.request_count + 1
    where public.ai_usage_daily.request_count < capped_limit
  returning request_count into next_count;

  return found and next_count <= capped_limit;
end;
$$;

revoke all on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;
