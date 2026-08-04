create table public.eon_import_batches (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source='eon_portal_export'), attachment_sha256 text not null check (attachment_sha256 ~ '^[0-9a-f]{64}$'),
  external_message_id text check (external_message_id is null or length(external_message_id) between 1 and 512),
  status text not null check (status in ('completed','completed_with_warnings')),
  period_start date not null, period_end date not null, raw_rows integer not null, valid_rows integer not null default 0,
  inserted_rows integer not null default 0, updated_rows integer not null default 0, unchanged_rows integer not null default 0,
  invalid_rows integer not null default 0, complete_days integer not null default 0, provisional_days integer not null default 0,
  incomplete_days integer not null default 0, warning_codes text[] not null default '{}', error_code text,
  created_at timestamptz not null default now(), completed_at timestamptz,
  constraint eon_batch_period_order check (period_start<=period_end),
  constraint eon_batch_has_rows check (raw_rows>0),
  constraint eon_batch_has_days check (complete_days+provisional_days+incomplete_days>0),
  constraint eon_batch_valid_raw check (valid_rows<=raw_rows),
  constraint eon_batch_processed_valid check (inserted_rows+updated_rows+unchanged_rows=valid_rows),
  constraint eon_batch_completed_at check (completed_at is not null),
  constraint eon_batch_no_error check (error_code is null),
  constraint eon_batch_warning_format check (warning_codes <@ array['PROVISIONAL_DAY','INCOMPLETE_DAY','INVALID_DAY','SUMMARY_TOTAL_MISMATCH','SUMMARY_MAX_MISMATCH']::text[]),
  constraint eon_batch_counts_nonnegative check (raw_rows>=0 and valid_rows>=0 and inserted_rows>=0 and updated_rows>=0 and unchanged_rows>=0 and invalid_rows>=0 and complete_days>=0 and provisional_days>=0 and incomplete_days>=0),
  constraint eon_batch_user_hash_key unique(user_id,attachment_sha256), constraint eon_batch_id_user_key unique(id,user_id)
);
create unique index eon_batch_user_message_idx on public.eon_import_batches(user_id,external_message_id) where external_message_id is not null;
create index eon_batch_user_created_idx on public.eon_import_batches(user_id,created_at desc);

create table public.eon_interval_readings (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  interval_start_utc timestamptz not null, local_date date not null check(local_date>=date '2000-01-01'),
  import_kwh numeric(14,6) not null check(import_kwh>=0), export_kwh numeric(14,6) not null check(export_kwh>=0),
  source text not null check(source='eon_portal_export'), last_import_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint eon_interval_user_time_key unique(user_id,interval_start_utc),
  constraint eon_interval_batch_owner_fk foreign key(last_import_batch_id,user_id) references public.eon_import_batches(id,user_id)
);
create index eon_interval_user_date_idx on public.eon_interval_readings(user_id,local_date);
create index eon_interval_user_time_idx on public.eon_interval_readings(user_id,interval_start_utc);
create trigger eon_interval_updated_at before update on public.eon_interval_readings for each row execute function public.set_updated_at();

alter table public.eon_import_batches enable row level security;
alter table public.eon_interval_readings enable row level security;
create policy eon_batches_select_own on public.eon_import_batches for select using(auth.uid()=user_id);
create policy eon_intervals_select_own on public.eon_interval_readings for select using(auth.uid()=user_id);
revoke all on public.eon_import_batches,public.eon_interval_readings from anon,authenticated;
grant select on public.eon_import_batches,public.eon_interval_readings to authenticated;

create or replace function public.import_eon_interval_batch(target_user_id uuid,batch jsonb,readings jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare bid uuid:=gen_random_uuid(); ins integer; upd integer; same integer;
begin
  if target_user_id is null then raise exception 'EON_TARGET_USER_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('eon-import-user:'||target_user_id::text,0));
  if batch is null or readings is null or jsonb_typeof(batch)<>'object' or jsonb_typeof(readings)<>'array' then raise exception 'EON_INVALID_BATCH'; end if;
  if batch->>'attachment_sha256' is null or batch->>'status' is null or batch->>'period_start' is null or batch->>'period_end' is null or batch->>'raw_rows' is null or batch->>'valid_rows' is null or batch->>'complete_days' is null or batch->>'provisional_days' is null or batch->>'incomplete_days' is null or batch->'warning_codes' is null then raise exception 'EON_INVALID_BATCH'; end if;
  if jsonb_typeof(batch->'warning_codes')<>'array' or (batch->>'raw_rows')::integer<=0 or (batch->>'period_start')::date>(batch->>'period_end')::date then raise exception 'EON_INVALID_BATCH'; end if;
  if exists(select 1 from public.eon_import_batches where user_id=target_user_id and attachment_sha256=batch->>'attachment_sha256') then raise exception 'EON_ALREADY_IMPORTED'; end if;
  if nullif(batch->>'external_message_id','') is not null then
    if exists(select 1 from public.eon_import_batches where user_id=target_user_id and external_message_id=batch->>'external_message_id') then raise exception 'EON_ALREADY_IMPORTED'; end if;
  end if;
  create temporary table eon_import_input(interval_start_utc timestamptz primary key,local_date date,import_kwh numeric,export_kwh numeric) on commit drop;
  insert into eon_import_input select x.interval_start_utc,x.local_date,x.import_kwh,x.export_kwh from jsonb_to_recordset(readings) as x(interval_start_utc timestamptz,local_date date,import_kwh numeric,export_kwh numeric);
  select count(*) filter(where old.id is null),count(*) filter(where old.id is not null and (old.import_kwh,old.export_kwh,old.local_date) is distinct from (src.import_kwh,src.export_kwh,src.local_date)),count(*) filter(where old.id is not null and (old.import_kwh,old.export_kwh,old.local_date) is not distinct from (src.import_kwh,src.export_kwh,src.local_date)) into ins,upd,same from eon_import_input src left join public.eon_interval_readings old on old.user_id=target_user_id and old.interval_start_utc=src.interval_start_utc;
  insert into public.eon_import_batches(id,user_id,source,attachment_sha256,external_message_id,status,period_start,period_end,raw_rows,valid_rows,inserted_rows,updated_rows,unchanged_rows,invalid_rows,complete_days,provisional_days,incomplete_days,warning_codes,completed_at)
  values(bid,target_user_id,'eon_portal_export',batch->>'attachment_sha256',nullif(batch->>'external_message_id',''),batch->>'status',(batch->>'period_start')::date,(batch->>'period_end')::date,(batch->>'raw_rows')::integer,(batch->>'valid_rows')::integer,ins,upd,same,(batch->>'invalid_rows')::integer,(batch->>'complete_days')::integer,(batch->>'provisional_days')::integer,(batch->>'incomplete_days')::integer,array(select distinct jsonb_array_elements_text(batch->'warning_codes')),now());
  insert into public.eon_interval_readings(user_id,interval_start_utc,local_date,import_kwh,export_kwh,source,last_import_batch_id)
  select target_user_id,interval_start_utc,local_date,import_kwh,export_kwh,'eon_portal_export',bid from eon_import_input
  on conflict(user_id,interval_start_utc) do update set local_date=excluded.local_date,import_kwh=excluded.import_kwh,export_kwh=excluded.export_kwh,source=excluded.source,last_import_batch_id=excluded.last_import_batch_id
  where (eon_interval_readings.local_date,eon_interval_readings.import_kwh,eon_interval_readings.export_kwh) is distinct from (excluded.local_date,excluded.import_kwh,excluded.export_kwh);
  return jsonb_build_object('batch_id',bid,'inserted_rows',ins,'updated_rows',upd,'unchanged_rows',same);
end $$;

revoke all on function public.import_eon_interval_batch(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.import_eon_interval_batch(uuid,jsonb,jsonb) to service_role;
