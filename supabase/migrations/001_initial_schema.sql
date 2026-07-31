create extension if not exists pgcrypto;

create type public.period_status as enum ('open', 'closed');

create table public.settlement_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date,
  opening_consumption_meter_kwh numeric(14,3) not null check (opening_consumption_meter_kwh >= 0),
  opening_production_meter_kwh numeric(14,3) not null check (opening_production_meter_kwh >= 0),
  closing_consumption_meter_kwh numeric(14,3),
  closing_production_meter_kwh numeric(14,3),
  status public.period_status not null default 'open',
  created_at timestamptz not null default now(),
  constraint closed_period_has_values check (
    status = 'open' or (end_date is not null and closing_consumption_meter_kwh is not null and closing_production_meter_kwh is not null)
  )
);

create unique index one_open_period_per_user
  on public.settlement_periods(user_id) where status = 'open';

create table public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reading_at timestamptz not null,
  consumption_meter_kwh numeric(14,3) not null check (consumption_meter_kwh >= 0),
  production_meter_kwh numeric(14,3) not null check (production_meter_kwh >= 0),
  note text check (char_length(note) <= 500),
  settlement_period_id uuid not null references public.settlement_periods(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, reading_at)
);

create index meter_readings_period_date_idx on public.meter_readings(settlement_period_id, reading_at);

create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger meter_readings_updated_at before update on public.meter_readings
for each row execute function public.set_updated_at();

alter table public.settlement_periods enable row level security;
alter table public.meter_readings enable row level security;

create policy "own periods only" on public.settlement_periods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own readings only" on public.meter_readings
  for all using (auth.uid() = user_id) with check (
    auth.uid() = user_id and exists (
      select 1 from public.settlement_periods p
      where p.id = settlement_period_id and p.user_id = auth.uid()
    )
  );

create or replace function public.close_settlement_period(period_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  current_period public.settlement_periods;
  last_reading public.meter_readings;
  new_period_id uuid;
begin
  select * into current_period from public.settlement_periods
    where id = period_id and user_id = auth.uid() and status = 'open' for update;
  if not found then raise exception 'A nyitott időszak nem található.'; end if;

  select * into last_reading from public.meter_readings
    where settlement_period_id = period_id and user_id = auth.uid()
    order by reading_at desc limit 1;
  if not found then raise exception 'A lezáráshoz legalább egy mérés szükséges.'; end if;

  update public.settlement_periods set
    status = 'closed',
    end_date = last_reading.reading_at::date,
    closing_consumption_meter_kwh = last_reading.consumption_meter_kwh,
    closing_production_meter_kwh = last_reading.production_meter_kwh
  where id = period_id;

  insert into public.settlement_periods (
    user_id, start_date, opening_consumption_meter_kwh, opening_production_meter_kwh
  ) values (
    auth.uid(), last_reading.reading_at::date,
    last_reading.consumption_meter_kwh, last_reading.production_meter_kwh
  ) returning id into new_period_id;

  return new_period_id;
end;
$$;

grant execute on function public.close_settlement_period(uuid) to authenticated;
