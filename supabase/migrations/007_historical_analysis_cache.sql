-- Additív napi historikus időjárás-cache. Meglévő adatot nem módosít.
create table public.weather_daily_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weather_location_key text not null,
  latitude numeric not null check (latitude between -90 and 90),
  longitude numeric not null check (longitude between -180 and 180),
  timezone text not null,
  date date not null,
  mean_temp_c numeric not null,
  min_temp_c numeric not null,
  max_temp_c numeric not null,
  source text not null default 'open_meteo' check (source = 'open_meteo'),
  fetched_at timestamptz not null default now(),
  constraint weather_daily_cache_temperatures check (min_temp_c <= mean_temp_c and mean_temp_c <= max_temp_c),
  constraint weather_daily_cache_user_location_date_key unique (user_id, weather_location_key, date)
);
create index weather_daily_cache_lookup_idx on public.weather_daily_cache(user_id, weather_location_key, date);
alter table public.weather_daily_cache enable row level security;
create policy weather_daily_cache_select_own on public.weather_daily_cache for select using (auth.uid() = user_id);
create policy weather_daily_cache_insert_own on public.weather_daily_cache for insert with check (auth.uid() = user_id);
create policy weather_daily_cache_update_own on public.weather_daily_cache for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy weather_daily_cache_delete_own on public.weather_daily_cache for delete using (auth.uid() = user_id);
