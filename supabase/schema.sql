-- Execute no SQL Editor do projeto Supabase antes de usar o app.
create table if not exists public.household_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"transactions":[],"bills":[],"recurringBills":[],"billPayments":{},"billAmounts":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.household_data enable row level security;

revoke all on public.household_data from anon;
grant select, insert, update on public.household_data to authenticated;

drop policy if exists "Household owner can read data" on public.household_data;
create policy "Household owner can read data"
  on public.household_data for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Household owner can create data" on public.household_data;
create policy "Household owner can create data"
  on public.household_data for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Household owner can update data" on public.household_data;
create policy "Household owner can update data"
  on public.household_data for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

