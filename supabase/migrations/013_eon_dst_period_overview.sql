alter table public.settlement_periods
  add column if not exists opening_reading_at timestamptz null;

update public.settlement_periods current_period
set opening_reading_at = (
  select reading.reading_at
  from public.settlement_periods previous_period
  join public.meter_readings reading
    on reading.settlement_period_id = previous_period.id
   and reading.user_id = current_period.user_id
  where previous_period.user_id = current_period.user_id
    and previous_period.status = 'closed'
    and previous_period.start_date < current_period.start_date
    and (reading.reading_at at time zone 'Europe/Budapest')::date = current_period.start_date
    and reading.reading_at = (select max(last_reading.reading_at) from public.meter_readings last_reading where last_reading.user_id=previous_period.user_id and last_reading.settlement_period_id=previous_period.id)
    and reading.consumption_meter_kwh = current_period.opening_consumption_meter_kwh
    and reading.production_meter_kwh = current_period.opening_production_meter_kwh
  order by reading.reading_at desc
  limit 1
)
where current_period.opening_reading_at is null;

alter table public.eon_import_batches drop constraint if exists eon_batch_warning_format;
alter table public.eon_import_batches add constraint eon_batch_warning_format check (
  warning_codes <@ array['PROVISIONAL_DAY','INCOMPLETE_DAY','INVALID_DAY','SUMMARY_TOTAL_MISMATCH','SUMMARY_MAX_MISMATCH','DST_SPRING_TEMPLATE_ALIGNED','DST_FALLBACK_SOURCE_96']::text[]
);

create or replace function public.close_settlement_period(period_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare current_period public.settlement_periods; last_reading public.meter_readings; new_period_id uuid;
begin
  select * into current_period from public.settlement_periods where id=period_id and user_id=auth.uid() and status='open' for update;
  if not found then raise exception 'A nyitott időszak nem található.'; end if;
  select * into last_reading from public.meter_readings where settlement_period_id=period_id and user_id=auth.uid() order by reading_at desc limit 1;
  if not found then raise exception 'A lezáráshoz legalább egy mérés szükséges.'; end if;
  update public.settlement_periods set status='closed',end_date=(last_reading.reading_at at time zone 'Europe/Budapest')::date,closing_consumption_meter_kwh=last_reading.consumption_meter_kwh,closing_production_meter_kwh=last_reading.production_meter_kwh where id=period_id;
  insert into public.settlement_periods(user_id,start_date,opening_reading_at,opening_consumption_meter_kwh,opening_production_meter_kwh)
  values(auth.uid(),(last_reading.reading_at at time zone 'Europe/Budapest')::date,last_reading.reading_at,last_reading.consumption_meter_kwh,last_reading.production_meter_kwh) returning id into new_period_id;
  return new_period_id;
end; $$;

create or replace function public.get_current_eon_period_overview()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare p public.settlement_periods; boundary timestamptz; precision text; first_interval timestamptz; today date := (now() at time zone 'Europe/Budapest')::date; result jsonb;
begin
  if auth.uid() is null then raise exception 'EON_UNAUTHORIZED'; end if;
  select * into p from public.settlement_periods where user_id=auth.uid() and status='open' order by start_date desc limit 1;
  if not found then return null; end if;
  precision := case when p.opening_reading_at is null then 'date_only' else 'exact' end;
  boundary := coalesce(p.opening_reading_at,p.start_date::timestamp at time zone 'Europe/Budapest');
  first_interval := to_timestamp(ceil(extract(epoch from boundary)/900.0)*900.0);
  with closed_dates as (
    select d::date local_date,d::date::timestamp at time zone 'Europe/Budapest' day_start,
      (d::date+1)::timestamp at time zone 'Europe/Budapest' day_end
    from generate_series((first_interval at time zone 'Europe/Budapest')::date,today-1,interval '1 day') d
  ), expected_dates as (
    select local_date,greatest(day_start,first_interval) expected_start,day_end expected_end,
      (extract(epoch from (day_end-greatest(day_start,first_interval)))/900)::int expected
    from closed_dates
  ), counts as (
    select d.local_date,count(r.id)::int available from expected_dates d left join public.eon_interval_readings r
      on r.user_id=auth.uid() and r.interval_start_utc>=d.expected_start and r.interval_start_utc<d.expected_end
    group by d.local_date
  ), coverage as (
    select d.local_date,d.expected,coalesce(c.available,0) available from expected_dates d left join counts c using(local_date)
  ), sums as (
    select coalesce(sum(import_kwh),0)::numeric import_kwh,coalesce(sum(export_kwh),0)::numeric export_kwh,count(*)::int available,max(interval_start_utc) last_at
    from public.eon_interval_readings where user_id=auth.uid() and interval_start_utc>=first_interval
  ), current_count as (
    select count(*)::int n from public.eon_interval_readings where user_id=auth.uid() and local_date=today and interval_start_utc>=first_interval
  )
  select jsonb_build_object(
    'periodId',p.id,'periodStartAt',boundary,'boundaryPrecision',precision,
    'gridImportKwh',s.import_kwh,'gridExportKwh',s.export_kwh,'netGridKwh',s.import_kwh-s.export_kwh,
    'availableIntervals',s.available,'expectedClosedDayIntervals',coalesce((select sum(expected) from coverage),0),
    'missingClosedDayIntervals',coalesce((select sum(greatest(expected-available,0)) from coverage),0),
    'closedDayCoveragePercent',case when coalesce((select sum(expected) from coverage),0)=0 then 100 else round(100.0*(select sum(least(expected,available)) from coverage)/(select sum(expected) from coverage),1) end,
    'completeDays',(select count(*) from coverage where available=expected),
    'provisionalDays',(select case when n>0 then 1 else 0 end from current_count),
    'incompleteDays',(select count(*) from coverage where available<>expected),
    'fallDstLimitedDays',(select count(*) from coverage where expected=100 and available=96),
    'lastDataAt',s.last_at,'stale',s.last_at is null or s.last_at < now()-interval '48 hours',
    'warnings',to_jsonb(array_remove(array[case when precision='date_only' then 'DATE_ONLY_BOUNDARY' end,case when exists(select 1 from coverage where available<>expected) then 'INCOMPLETE_CLOSED_DAYS' end,case when exists(select 1 from coverage where expected=100 and available=96) then 'DST_FALLBACK_SOURCE_96' end,case when s.last_at is null then 'NO_EON_DATA' when s.last_at<now()-interval '48 hours' then 'STALE_DATA' end],null)),
    'incompleteDates',coalesce((select jsonb_agg(local_date order by local_date) from (select local_date from coverage where available<>expected order by local_date limit 20) x),'[]'::jsonb)
  ) into result from sums s;
  return result;
end; $$;

revoke all on function public.get_current_eon_period_overview() from public,anon;
grant execute on function public.get_current_eon_period_overview() to authenticated;
