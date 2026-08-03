create table public.solar_monthly_analysis_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  year_month text not null check (year_month ~ '^(19[0-9]{2}|[2-9][0-9]{3})-(0[1-9]|1[0-2])$'),
  timezone text not null,
  meter_source text not null default 'manual_readings' check (meter_source in ('manual_readings', 'p1_intervals')),
  grid_import_kwh numeric not null check (grid_import_kwh >= 0),
  grid_export_kwh numeric not null check (grid_export_kwh >= 0),
  pv_production_kwh numeric not null check (pv_production_kwh >= 0),
  self_consumed_pv_kwh numeric not null check (self_consumed_pv_kwh >= 0),
  total_home_consumption_kwh numeric not null check (total_home_consumption_kwh >= 0),
  pv_self_consumption_ratio numeric null check (pv_self_consumption_ratio is null or pv_self_consumption_ratio between 0 and 1),
  pv_coverage_ratio numeric not null check (pv_coverage_ratio between 0 and 1),
  analysis_status text not null check (analysis_status in ('complete', 'estimated_meter_allocation')),
  meter_data_quality text not null check (meter_data_quality in ('complete', 'estimated')),
  pv_expected_days integer not null check (pv_expected_days >= 0),
  pv_stored_days integer not null check (pv_stored_days >= 0),
  pv_complete_days integer not null check (pv_complete_days >= 0),
  pv_provisional_days integer not null check (pv_provisional_days >= 0),
  pv_invalid_days integer not null check (pv_invalid_days >= 0),
  meter_coverage_start_at timestamptz null,
  meter_coverage_end_at timestamptz null,
  algorithm_version integer not null check (algorithm_version > 0),
  input_fingerprint text not null,
  finalized_at timestamptz not null,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solar_monthly_snapshots_energy_consistency check (self_consumed_pv_kwh <= pv_production_kwh),
  constraint solar_monthly_snapshots_self_ratio_presence check ((pv_production_kwh > 0 and pv_self_consumption_ratio is not null) or (pv_production_kwh = 0 and pv_self_consumption_ratio is null)),
  constraint solar_monthly_snapshots_stored_days_check check (pv_stored_days <= pv_expected_days),
  constraint solar_monthly_snapshots_complete_days_check check (pv_complete_days <= pv_stored_days),
  constraint solar_monthly_snapshots_provisional_days_check check (pv_provisional_days <= pv_stored_days and pv_provisional_days = 0),
  constraint solar_monthly_snapshots_invalid_days_check check (pv_invalid_days <= pv_stored_days and pv_invalid_days = 0),
  constraint solar_monthly_snapshots_meter_coverage_order check (meter_coverage_start_at is null or meter_coverage_end_at is null or meter_coverage_start_at <= meter_coverage_end_at),
  constraint solar_monthly_snapshots_status_quality_check check ((analysis_status = 'complete' and meter_data_quality = 'complete') or (analysis_status = 'estimated_meter_allocation' and meter_data_quality = 'estimated')),
  constraint solar_monthly_snapshots_user_month_version_key unique (user_id, year_month, algorithm_version)
);

create index solar_monthly_snapshots_user_month_idx on public.solar_monthly_analysis_snapshots(user_id, year_month desc);
create trigger solar_monthly_snapshots_updated_at before update on public.solar_monthly_analysis_snapshots
for each row execute function public.set_updated_at();
alter table public.solar_monthly_analysis_snapshots enable row level security;
create policy solar_monthly_snapshots_select_own on public.solar_monthly_analysis_snapshots for select using (auth.uid() = user_id);
create policy solar_monthly_snapshots_insert_own on public.solar_monthly_analysis_snapshots for insert with check (auth.uid() = user_id);
create policy solar_monthly_snapshots_update_own on public.solar_monthly_analysis_snapshots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy solar_monthly_snapshots_delete_own on public.solar_monthly_analysis_snapshots for delete using (auth.uid() = user_id);
