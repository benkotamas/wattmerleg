create table public.tariff_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  discounted_limit_kwh numeric(14,3) not null default 2523 check (discounted_limit_kwh >= 0),
  discounted_price_ft numeric(14,3) not null default 36 check (discounted_price_ft >= 0),
  market_price_ft numeric(14,3) not null default 70.1 check (market_price_ft >= 0),
  feed_in_price_ft numeric(14,3) not null default 5 check (feed_in_price_ft >= 0),
  annual_closing_month smallint not null default 8 check (annual_closing_month between 1 and 12),
  annual_closing_day smallint not null default 4 check (annual_closing_day between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.tariff_settings enable row level security;

create policy "own tariff settings only" on public.tariff_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger tariff_settings_updated_at before update on public.tariff_settings
for each row execute function public.set_updated_at();

-- A már létező felhasználók megkapják az MVP eddigi alapértékeit.
insert into public.tariff_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;
