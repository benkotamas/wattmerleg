create table public.growatt_daily_energy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  local_date date not null,
  energy_kwh numeric not null check (energy_kwh >= 0),
  plant_timezone text not null,
  source text not null default 'growatt_openapi_v1' check (source = 'growatt_openapi_v1'),
  quality_status text not null default 'complete' check (quality_status in ('complete', 'provisional', 'missing', 'invalid')),
  api_last_update_at timestamptz null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growatt_daily_energy_user_date_key unique (user_id, local_date)
);

create index growatt_daily_energy_date_idx on public.growatt_daily_energy(local_date);

create trigger growatt_daily_energy_updated_at before update on public.growatt_daily_energy
for each row execute function public.set_updated_at();

alter table public.growatt_daily_energy enable row level security;
create policy growatt_daily_energy_select_own on public.growatt_daily_energy for select using (auth.uid() = user_id);
create policy growatt_daily_energy_insert_own on public.growatt_daily_energy for insert with check (auth.uid() = user_id);
create policy growatt_daily_energy_update_own on public.growatt_daily_energy for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy growatt_daily_energy_delete_own on public.growatt_daily_energy for delete using (auth.uid() = user_id);
