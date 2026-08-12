create table public.settlement_bill_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  settlement_period_id uuid not null references public.settlement_periods(id) on delete restrict,
  billing_start_date date not null,
  billing_end_date date not null,
  opening_consumption_meter_kwh numeric(14,3) not null check (opening_consumption_meter_kwh >= 0),
  opening_production_meter_kwh numeric(14,3) not null check (opening_production_meter_kwh >= 0),
  closing_consumption_meter_kwh numeric(14,3) not null check (closing_consumption_meter_kwh >= opening_consumption_meter_kwh),
  closing_production_meter_kwh numeric(14,3) not null check (closing_production_meter_kwh >= opening_production_meter_kwh),
  consumption_kwh numeric(14,3) not null check (consumption_kwh >= 0),
  production_kwh numeric(14,3) not null check (production_kwh >= 0),
  balance_kwh numeric(14,3) not null,
  billing_days integer not null check (billing_days > 0),
  discounted_quantity_kwh numeric(14,3) not null check (discounted_quantity_kwh >= 0),
  discounted_fee_ft numeric(14,3) not null check (discounted_fee_ft >= 0),
  market_quantity_kwh numeric(14,3) not null check (market_quantity_kwh >= 0),
  market_fee_ft numeric(14,3) not null check (market_fee_ft >= 0),
  base_fee_ft numeric(14,3) not null check (base_fee_ft >= 0),
  feed_in_credit_ft numeric(14,3) not null,
  calculated_total_ft numeric(14,3) not null,
  discounted_limit_kwh numeric(14,3) not null check (discounted_limit_kwh >= 0),
  discounted_price_ft numeric(14,3) not null check (discounted_price_ft >= 0),
  market_price_ft numeric(14,3) not null check (market_price_ft >= 0),
  monthly_base_fee_ft numeric(14,3) not null check (monthly_base_fee_ft >= 0),
  feed_in_price_ft numeric(14,3) not null check (feed_in_price_ft >= 0),
  official_total_ft numeric(14,3),
  invoice_reference text check (invoice_reference is null or char_length(invoice_reference) <= 100),
  calculation_version text not null default 'mvm-2026-v1' check (char_length(calculation_version) between 1 and 50),
  snapshotted_at timestamptz not null default now(),
  official_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, settlement_period_id),
  constraint settlement_bill_snapshot_dates check (billing_end_date >= billing_start_date)
);

create index settlement_bill_snapshots_user_start_idx
  on public.settlement_bill_snapshots(user_id, billing_start_date desc);

create or replace function public.protect_settlement_bill_snapshot_calculation()
returns trigger language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) - 'official_total_ft' - 'invoice_reference' - 'official_updated_at' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'official_total_ft' - 'invoice_reference' - 'official_updated_at' - 'updated_at') then
    raise exception 'BILLING_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger settlement_bill_snapshots_protect_calculation
before update on public.settlement_bill_snapshots
for each row execute function public.protect_settlement_bill_snapshot_calculation();

create trigger settlement_bill_snapshots_updated_at
before update on public.settlement_bill_snapshots
for each row execute function public.set_updated_at();

alter table public.settlement_bill_snapshots enable row level security;

create policy settlement_bill_snapshots_select_own
  on public.settlement_bill_snapshots for select
  using (auth.uid() = user_id);

create policy settlement_bill_snapshots_insert_closed_own
  on public.settlement_bill_snapshots for insert
  with check (
    auth.uid() = user_id and exists (
      select 1 from public.settlement_periods period
      where period.id = settlement_period_id
        and period.user_id = auth.uid()
        and period.status = 'closed'
    )
  );

create policy settlement_bill_snapshots_update_own
  on public.settlement_bill_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.settlement_bill_snapshots is
  'Lezárt elszámolási időszak megváltoztathatatlan MVM díjszámítási pillanatképe és opcionális hivatalos számlaadata.';
comment on column public.settlement_bill_snapshots.official_total_ft is
  'Az MVM számlán szereplő hivatalos végösszeg; a calculated_total_ft értékkel összevethető.';
comment on column public.settlement_bill_snapshots.calculation_version is
  'A pillanatkép létrehozásakor alkalmazott díjszámítás verziója.';
