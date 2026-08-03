create table public.growatt_history_sync_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  history_start_month date not null default date '2022-01-01' check (history_start_month >= date '1900-01-01' and history_start_month = date_trunc('month', history_start_month)::date),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.growatt_history_sync_jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  selection_type text not null check (selection_type in ('current_month','previous_month','custom_month','repair_incomplete','full_history')),
  start_date date not null, end_date date not null, cursor_date date not null,
  status text not null default 'queued' check (status in ('queued','running','rate_limited','paused','retry_pending','finalizing_snapshots','completed','failed','cancelling','cancelled')),
  claim_token uuid, lease_expires_at timestamptz, current_chunk_start date, current_chunk_end date,
  total_days integer not null, completed_days integer not null default 0, already_complete_days integer not null default 0,
  refreshed_days integer not null default 0, failed_days integer not null default 0,
  refreshed_dates date[] not null default '{}', failed_dates date[] not null default '{}',
  snapshot_pending_months text[] not null default '{}', snapshot_refreshed_months text[] not null default '{}', snapshot_failed_months text[] not null default '{}',
  snapshot_month_results jsonb not null default '{}'::jsonb, snapshot_last_error_code text,
  history_retry_count integer not null default 0, snapshot_retry_count integer not null default 0,
  invalid_records integer not null default 0, duplicate_records integer not null default 0, processed_chunks integer not null default 0,
  retry_after timestamptz, last_error_code text, started_at timestamptz, last_activity_at timestamptz not null default now(), completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint growatt_sync_range_check check (end_date >= start_date and cursor_date >= start_date and cursor_date <= end_date + 1),
  constraint growatt_sync_counts_check check (total_days > 0 and completed_days between 0 and total_days and already_complete_days between 0 and total_days and refreshed_days between 0 and total_days and failed_days between 0 and total_days and invalid_records >= 0 and duplicate_records >= 0 and processed_chunks >= 0 and history_retry_count >= 0 and snapshot_retry_count >= 0),
  constraint growatt_sync_chunk_pair_check check ((current_chunk_start is null) = (current_chunk_end is null)),
  constraint growatt_sync_chunk_order_check check (current_chunk_start is null or current_chunk_start <= current_chunk_end),
  constraint growatt_sync_chunk_range_check check (current_chunk_start is null or (current_chunk_start >= start_date and current_chunk_end <= end_date)),
  constraint growatt_sync_claim_pair_check check ((claim_token is null) = (lease_expires_at is null)),
  constraint growatt_sync_claim_chunk_check check ((claim_token is null and current_chunk_start is null and current_chunk_end is null) or (claim_token is not null and lease_expires_at is not null and current_chunk_start is not null and current_chunk_end is not null)),
  constraint growatt_sync_terminal_claim_check check (status not in ('completed','cancelled') or claim_token is null),
  constraint growatt_sync_snapshot_months_check check (array_to_string(snapshot_pending_months || snapshot_refreshed_months || snapshot_failed_months,'|') ~ '^(((19|2[0-9])[0-9]{2}-(0[1-9]|1[0-2]))(\|((19|2[0-9])[0-9]{2}-(0[1-9]|1[0-2])))*)?$')
);

create unique index growatt_history_sync_jobs_one_active_user_idx on public.growatt_history_sync_jobs(user_id)
where status in ('queued','running','rate_limited','paused','retry_pending','finalizing_snapshots','failed','cancelling');
create index growatt_history_sync_jobs_user_created_idx on public.growatt_history_sync_jobs(user_id,created_at desc);
create trigger growatt_history_sync_settings_updated_at before update on public.growatt_history_sync_settings for each row execute function public.set_updated_at();
create trigger growatt_history_sync_jobs_updated_at before update on public.growatt_history_sync_jobs for each row execute function public.set_updated_at();
alter table public.growatt_history_sync_settings enable row level security; alter table public.growatt_history_sync_jobs enable row level security;
create policy growatt_history_sync_settings_own on public.growatt_history_sync_settings for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy growatt_history_sync_jobs_select_own on public.growatt_history_sync_jobs for select using (auth.uid()=user_id);
create policy growatt_history_sync_jobs_insert_own on public.growatt_history_sync_jobs for insert with check (auth.uid()=user_id);
create policy growatt_history_sync_jobs_update_own on public.growatt_history_sync_jobs for update using (auth.uid()=user_id) with check (auth.uid()=user_id);

create or replace function public.cancel_growatt_history_sync_job(job_id uuid,expected_status text)
returns setof public.growatt_history_sync_jobs language sql security invoker set search_path=public as $$
 update public.growatt_history_sync_jobs set
   status=case when claim_token is not null and lease_expires_at>now() then 'cancelling' else 'cancelled' end,
   claim_token=case when claim_token is not null and lease_expires_at>now() then claim_token else null end,
   lease_expires_at=case when claim_token is not null and lease_expires_at>now() then lease_expires_at else null end,
   current_chunk_start=case when claim_token is not null and lease_expires_at>now() then current_chunk_start else null end,
   current_chunk_end=case when claim_token is not null and lease_expires_at>now() then current_chunk_end else null end,
   retry_after=null,last_activity_at=now(),
   completed_at=case when claim_token is not null and lease_expires_at>now() then completed_at else now() end
 where id=job_id and user_id=auth.uid() and status=expected_status
   and status in ('queued','running','paused','retry_pending','rate_limited','failed','finalizing_snapshots','cancelling')
 returning *;
$$;

create or replace function public.claim_growatt_history_sync_job_block(job_id uuid,expected_cursor date,chunk_start date,chunk_end date,new_claim_token uuid,lease_seconds integer default 300)
returns setof public.growatt_history_sync_jobs language sql security invoker set search_path=public as $$
 update public.growatt_history_sync_jobs set status=case when status='finalizing_snapshots' then status else 'running' end,claim_token=new_claim_token,lease_expires_at=now()+make_interval(secs=>lease_seconds),current_chunk_start=chunk_start,current_chunk_end=chunk_end,started_at=coalesce(started_at,now()),last_activity_at=now()
 where id=job_id and user_id=auth.uid() and cursor_date=expected_cursor
   and status in ('queued','running','rate_limited','retry_pending','finalizing_snapshots') and (retry_after is null or retry_after<=now())
   and (claim_token is null or lease_expires_at<=now())
 returning *;
$$;

create or replace function public.finish_growatt_history_sync_job_block(job_id uuid,expected_claim_token uuid,next_cursor date,next_status text,new_completed_days integer,new_already_complete_days integer,new_refreshed_dates date[],new_failed_dates date[],added_invalid integer,added_duplicates integer,error_code text default null,retry_at timestamptz default null,new_history_retry_count integer default null,new_snapshot_retry_count integer default null)
returns setof public.growatt_history_sync_jobs language sql security invoker set search_path=public as $$
 update public.growatt_history_sync_jobs set cursor_date=next_cursor,
   status=case when status='paused' then 'paused' when status='cancelling' then 'cancelled' else next_status end,
   completed_days=new_completed_days,already_complete_days=new_already_complete_days,
   refreshed_dates=(select coalesce(array_agg(distinct d),'{}') from unnest(refreshed_dates||new_refreshed_dates) d),
   failed_dates=(select coalesce(array_agg(distinct d),'{}') from unnest(new_failed_dates) d),
   refreshed_days=cardinality((select coalesce(array_agg(distinct d),'{}') from unnest(refreshed_dates||new_refreshed_dates) d)),
   failed_days=cardinality((select coalesce(array_agg(distinct d),'{}') from unnest(new_failed_dates) d)),
   invalid_records=invalid_records+greatest(added_invalid,0),duplicate_records=duplicate_records+greatest(added_duplicates,0),
   history_retry_count=coalesce(new_history_retry_count,history_retry_count),snapshot_retry_count=coalesce(new_snapshot_retry_count,snapshot_retry_count),
   processed_chunks=processed_chunks+1,last_error_code=error_code,retry_after=retry_at,
   claim_token=null,lease_expires_at=null,current_chunk_start=null,current_chunk_end=null,last_activity_at=now(),
   completed_at=case when status='cancelling' or (next_status='completed' and status<>'paused') then now() else completed_at end
 where id=job_id and user_id=auth.uid() and claim_token=expected_claim_token and status in ('running','paused','cancelling','finalizing_snapshots')
 returning *;
$$;
