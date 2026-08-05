-- Historical E.ON heating analysis. No personal dates or measurements are seeded.
create table public.heating_operation_periods (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 enabled_at timestamptz not null, disabled_at timestamptz, source text not null default 'manual' check(source='manual'),
 note text not null default '' check(length(note)<=1000), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(disabled_at is null or disabled_at>enabled_at), unique(user_id,enabled_at)
);
create unique index heating_operation_one_open_idx on public.heating_operation_periods(user_id) where disabled_at is null;
create index heating_operation_user_time_idx on public.heating_operation_periods(user_id,enabled_at,disabled_at);
create function public.prevent_overlapping_heating_operation_periods() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('heating-operation:'||new.user_id::text,0));
 if exists(select 1 from public.heating_operation_periods p where p.user_id=new.user_id and p.id<>new.id and tstzrange(p.enabled_at,p.disabled_at,'[)')&&tstzrange(new.enabled_at,new.disabled_at,'[)')) then raise exception 'HEATING_OPERATION_PERIOD_OVERLAP'; end if;
 return new;
end $$;
create trigger heating_operation_no_overlap before insert or update on public.heating_operation_periods for each row execute function public.prevent_overlapping_heating_operation_periods();

create table public.heating_weather_hourly (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,observed_at timestamptz not null,
 temperature_c numeric not null,wind_speed_kmh numeric,shortwave_radiation_wm2 numeric,cloud_cover_percent numeric,
 source text not null check(source in('open_meteo_archive','open_meteo_forecast')),quality_status text not null check(quality_status in('complete','provisional','missing','invalid')),
 fetched_at timestamptz not null default now(),unique(user_id,observed_at)
);
create index heating_weather_user_time_idx on public.heating_weather_hourly(user_id,observed_at);

create table public.heating_energy_daily_features (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,local_date date not null,model_version text not null,
 grid_import_kwh numeric,grid_export_kwh numeric,pv_production_kwh numeric,total_home_consumption_kwh numeric,baseline_kwh numeric,grid_import_baseline_kwh numeric,excess_kwh numeric,detected_grid_heating_kwh numeric,daily_heating_excess_kwh numeric,estimated_heating_kwh numeric,
 average_temperature_c numeric,minimum_temperature_c numeric,maximum_temperature_c numeric,heating_degree_hours numeric,weather_coverage_percent numeric,
 available_intervals integer not null,expected_intervals integer not null,coverage_percent numeric not null,provisional boolean not null default false,
 detected_cycle_count integer not null default 0 check(detected_cycle_count>=0),confidence text not null check(confidence in('low','medium','high')),
 data_quality_warnings text[] not null default '{}',is_heating_relevant boolean not null default false,
 operation_state text not null check(operation_state in('definitely_off','available','mixed','unknown')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,local_date,model_version),
 check(available_intervals>=0 and expected_intervals in(92,96,100) and coverage_percent between 0 and 100),
 check(total_home_consumption_kwh is null or total_home_consumption_kwh>=0),check(estimated_heating_kwh is null or estimated_heating_kwh>=0)
);
create index heating_features_user_date_idx on public.heating_energy_daily_features(user_id,local_date desc);

create table public.heating_analysis_models (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,model_version text not null,
 period_start date not null,period_end date not null,baseline_training_days integer not null default 0,analyzed_days integer not null default 0,excluded_days integer not null default 0,
 learned_night_baseline_kwh numeric,learned_daily_baseline_kwh numeric,estimated_heating_kwh numeric,confidence text not null check(confidence in('low','medium','high')),
 detected_season_start date,detected_season_end date,manual_season_start date,manual_season_end date,season_start_difference_days integer,season_end_difference_days integer,
 summary jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,model_version),check(period_start<=period_end)
);
create table public.heating_day_validations (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,local_date date not null,
 label text not null check(label in('definitely_on','definitely_off','uncertain')),note text not null default '' check(length(note)<=1000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,local_date)
);
create table public.heating_analysis_runs (
 user_id uuid primary key references auth.users(id) on delete cascade,
 started_at timestamptz not null default now()
);
revoke all on public.heating_analysis_runs from public,anon,authenticated;

create trigger heating_operation_updated_at before update on public.heating_operation_periods for each row execute function public.set_updated_at();
create trigger heating_features_updated_at before update on public.heating_energy_daily_features for each row execute function public.set_updated_at();
create trigger heating_models_updated_at before update on public.heating_analysis_models for each row execute function public.set_updated_at();
create trigger heating_validations_updated_at before update on public.heating_day_validations for each row execute function public.set_updated_at();
alter table public.heating_operation_periods enable row level security;alter table public.heating_weather_hourly enable row level security;alter table public.heating_energy_daily_features enable row level security;alter table public.heating_analysis_models enable row level security;alter table public.heating_day_validations enable row level security;
create policy heating_operation_select_own on public.heating_operation_periods for select using(auth.uid()=user_id);create policy heating_operation_insert_own on public.heating_operation_periods for insert with check(auth.uid()=user_id);create policy heating_operation_update_own on public.heating_operation_periods for update using(auth.uid()=user_id) with check(auth.uid()=user_id);create policy heating_operation_delete_own on public.heating_operation_periods for delete using(auth.uid()=user_id);
create policy heating_weather_select_own on public.heating_weather_hourly for select using(auth.uid()=user_id);create policy heating_features_select_own on public.heating_energy_daily_features for select using(auth.uid()=user_id);create policy heating_models_select_own on public.heating_analysis_models for select using(auth.uid()=user_id);
create policy heating_validations_select_own on public.heating_day_validations for select using(auth.uid()=user_id);create policy heating_validations_insert_own on public.heating_day_validations for insert with check(auth.uid()=user_id);create policy heating_validations_update_own on public.heating_day_validations for update using(auth.uid()=user_id) with check(auth.uid()=user_id);create policy heating_validations_delete_own on public.heating_day_validations for delete using(auth.uid()=user_id);
revoke all on public.heating_weather_hourly,public.heating_energy_daily_features,public.heating_analysis_models from anon,authenticated;
grant select on public.heating_weather_hourly,public.heating_energy_daily_features,public.heating_analysis_models to authenticated;
grant select,insert,update,delete on public.heating_operation_periods,public.heating_day_validations to authenticated;

create function public.claim_heating_analysis(target_user_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from public.heating_analysis_runs where started_at<now()-interval '15 minutes';
 insert into public.heating_analysis_runs(user_id) values(target_user_id) on conflict do nothing;
 return found;
end $$;
create function public.release_heating_analysis(target_user_id uuid) returns void language sql security definer set search_path=public,pg_temp as $$delete from public.heating_analysis_runs where user_id=target_user_id$$;

create function public.save_heating_weather_hourly(target_user_id uuid,rows jsonb) returns integer language plpgsql security definer set search_path=public,pg_temp as $$ declare count_rows integer;begin
 if target_user_id is null or jsonb_typeof(rows)<>'array' then raise exception 'HEATING_ANALYSIS_INVALID_INPUT';end if;
 insert into public.heating_weather_hourly(user_id,observed_at,temperature_c,wind_speed_kmh,shortwave_radiation_wm2,cloud_cover_percent,source,quality_status,fetched_at)
 select target_user_id,x.observed_at,x.temperature_c,x.wind_speed_kmh,x.shortwave_radiation_wm2,x.cloud_cover_percent,coalesce(x.source,'open_meteo_archive'),'complete',now() from jsonb_to_recordset(rows) x(observed_at timestamptz,temperature_c numeric,wind_speed_kmh numeric,shortwave_radiation_wm2 numeric,cloud_cover_percent numeric,source text)
 on conflict(user_id,observed_at) do update set temperature_c=excluded.temperature_c,wind_speed_kmh=excluded.wind_speed_kmh,shortwave_radiation_wm2=excluded.shortwave_radiation_wm2,cloud_cover_percent=excluded.cloud_cover_percent,source=excluded.source,quality_status=excluded.quality_status,fetched_at=excluded.fetched_at;
 get diagnostics count_rows=row_count;return count_rows;end $$;

create function public.save_heating_analysis(target_user_id uuid,target_model_version text,features jsonb,model jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare saved integer;begin
 if target_user_id is null or target_model_version is null or jsonb_typeof(features)<>'array' or jsonb_typeof(model)<>'object' then raise exception 'HEATING_ANALYSIS_INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('heating-analysis:'||target_user_id::text,0));
 delete from public.heating_energy_daily_features f where f.user_id=target_user_id and f.model_version=target_model_version and not exists(select 1 from jsonb_array_elements(features) x where x->>'local_date'=f.local_date::text);
 insert into public.heating_energy_daily_features(user_id,local_date,model_version,grid_import_kwh,grid_export_kwh,pv_production_kwh,total_home_consumption_kwh,baseline_kwh,grid_import_baseline_kwh,excess_kwh,detected_grid_heating_kwh,daily_heating_excess_kwh,estimated_heating_kwh,average_temperature_c,minimum_temperature_c,maximum_temperature_c,heating_degree_hours,weather_coverage_percent,available_intervals,expected_intervals,coverage_percent,provisional,detected_cycle_count,confidence,data_quality_warnings,is_heating_relevant,operation_state)
 select target_user_id,x.local_date,target_model_version,x.grid_import_kwh,x.grid_export_kwh,x.pv_production_kwh,x.total_home_consumption_kwh,x.baseline_kwh,x.grid_import_baseline_kwh,x.excess_kwh,x.detected_grid_heating_kwh,x.daily_heating_excess_kwh,x.estimated_heating_kwh,x.average_temperature_c,x.minimum_temperature_c,x.maximum_temperature_c,x.heating_degree_hours,x.weather_coverage_percent,x.available_intervals,x.expected_intervals,x.coverage_percent,x.provisional,x.detected_cycle_count,x.confidence,x.data_quality_warnings,x.is_heating_relevant,x.operation_state from jsonb_to_recordset(features) x(local_date date,grid_import_kwh numeric,grid_export_kwh numeric,pv_production_kwh numeric,total_home_consumption_kwh numeric,baseline_kwh numeric,grid_import_baseline_kwh numeric,excess_kwh numeric,detected_grid_heating_kwh numeric,daily_heating_excess_kwh numeric,estimated_heating_kwh numeric,average_temperature_c numeric,minimum_temperature_c numeric,maximum_temperature_c numeric,heating_degree_hours numeric,weather_coverage_percent numeric,available_intervals integer,expected_intervals integer,coverage_percent numeric,provisional boolean,detected_cycle_count integer,confidence text,data_quality_warnings text[],is_heating_relevant boolean,operation_state text)
 on conflict(user_id,local_date,model_version) do update set grid_import_kwh=excluded.grid_import_kwh,grid_export_kwh=excluded.grid_export_kwh,pv_production_kwh=excluded.pv_production_kwh,total_home_consumption_kwh=excluded.total_home_consumption_kwh,baseline_kwh=excluded.baseline_kwh,grid_import_baseline_kwh=excluded.grid_import_baseline_kwh,excess_kwh=excluded.excess_kwh,detected_grid_heating_kwh=excluded.detected_grid_heating_kwh,daily_heating_excess_kwh=excluded.daily_heating_excess_kwh,estimated_heating_kwh=excluded.estimated_heating_kwh,average_temperature_c=excluded.average_temperature_c,minimum_temperature_c=excluded.minimum_temperature_c,maximum_temperature_c=excluded.maximum_temperature_c,heating_degree_hours=excluded.heating_degree_hours,weather_coverage_percent=excluded.weather_coverage_percent,available_intervals=excluded.available_intervals,expected_intervals=excluded.expected_intervals,coverage_percent=excluded.coverage_percent,provisional=excluded.provisional,detected_cycle_count=excluded.detected_cycle_count,confidence=excluded.confidence,data_quality_warnings=excluded.data_quality_warnings,is_heating_relevant=excluded.is_heating_relevant,operation_state=excluded.operation_state,updated_at=now();get diagnostics saved=row_count;
 insert into public.heating_analysis_models(user_id,model_version,period_start,period_end,baseline_training_days,analyzed_days,excluded_days,learned_night_baseline_kwh,learned_daily_baseline_kwh,estimated_heating_kwh,confidence,detected_season_start,detected_season_end,manual_season_start,manual_season_end,season_start_difference_days,season_end_difference_days,summary)
 values(target_user_id,target_model_version,(model->>'period_start')::date,(model->>'period_end')::date,(model->>'baseline_training_days')::integer,(model->>'analyzed_days')::integer,(model->>'excluded_days')::integer,(model->>'learned_night_baseline_kwh')::numeric,(model->>'learned_daily_baseline_kwh')::numeric,(model->>'estimated_heating_kwh')::numeric,model->>'confidence',(model->>'detected_season_start')::date,(model->>'detected_season_end')::date,(model->>'manual_season_start')::date,(model->>'manual_season_end')::date,(model->>'season_start_difference_days')::integer,(model->>'season_end_difference_days')::integer,coalesce(model->'summary','{}'))
 on conflict(user_id,model_version) do update set period_start=excluded.period_start,period_end=excluded.period_end,baseline_training_days=excluded.baseline_training_days,analyzed_days=excluded.analyzed_days,excluded_days=excluded.excluded_days,learned_night_baseline_kwh=excluded.learned_night_baseline_kwh,learned_daily_baseline_kwh=excluded.learned_daily_baseline_kwh,estimated_heating_kwh=excluded.estimated_heating_kwh,confidence=excluded.confidence,detected_season_start=excluded.detected_season_start,detected_season_end=excluded.detected_season_end,manual_season_start=excluded.manual_season_start,manual_season_end=excluded.manual_season_end,season_start_difference_days=excluded.season_start_difference_days,season_end_difference_days=excluded.season_end_difference_days,summary=excluded.summary,updated_at=now();
 return jsonb_build_object('saved_features',saved,'model_version',target_model_version);end $$;
revoke all on function public.claim_heating_analysis(uuid),public.release_heating_analysis(uuid),public.save_heating_weather_hourly(uuid,jsonb),public.save_heating_analysis(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.claim_heating_analysis(uuid),public.release_heating_analysis(uuid),public.save_heating_weather_hourly(uuid,jsonb),public.save_heating_analysis(uuid,text,jsonb,jsonb) to service_role;
