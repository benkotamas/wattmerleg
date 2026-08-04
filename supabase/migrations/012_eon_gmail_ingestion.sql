create table public.eon_gmail_messages (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 gmail_message_id text not null check(length(gmail_message_id) between 1 and 512), internal_date timestamptz,
 status text not null check(status in ('pending','processing','imported','duplicate','ignored','retry','failed')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 5), next_retry_at timestamptz,
 claim_token uuid, claim_expires_at timestamptz, attachment_sha256 text check(attachment_sha256 is null or attachment_sha256 ~ '^[0-9a-f]{64}$'),
 import_batch_id uuid, error_code text check(error_code is null or length(error_code)<=80),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
 unique(user_id,gmail_message_id), foreign key(import_batch_id,user_id) references public.eon_import_batches(id,user_id),
 check((claim_token is null)=(claim_expires_at is null)),
 check((status='processing')=(claim_token is not null)),
 check(status not in ('imported','duplicate') or import_batch_id is not null)
);
create index eon_gmail_messages_user_status_idx on public.eon_gmail_messages(user_id,status,next_retry_at);
alter table public.eon_gmail_messages enable row level security;
revoke all on public.eon_gmail_messages from anon,authenticated;
grant select on public.eon_gmail_messages to authenticated;
create policy eon_gmail_messages_select_own on public.eon_gmail_messages for select using(auth.uid()=user_id);

create table public.eon_gmail_ingestion_state(user_id uuid primary key references auth.users(id) on delete cascade,mailbox_verified boolean not null default false,last_run_at timestamptz,last_successful_import_at timestamptz,last_error_code text check(last_error_code is null or length(last_error_code)<=80),updated_at timestamptz not null default now());
alter table public.eon_gmail_ingestion_state enable row level security;
revoke all on public.eon_gmail_ingestion_state from anon,authenticated;
grant select on public.eon_gmail_ingestion_state to authenticated;
create policy eon_gmail_state_select_own on public.eon_gmail_ingestion_state for select using(auth.uid()=user_id);
grant all on public.eon_gmail_messages,public.eon_gmail_ingestion_state to service_role;

create or replace function public.claim_eon_gmail_message(target_user_id uuid,target_gmail_message_id text,target_internal_date timestamptz default null)
returns table(claim_token uuid,attempt_count integer) language plpgsql security definer set search_path=public,pg_temp as $$
declare token uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtextextended(target_user_id::text||':'||target_gmail_message_id,0));
 insert into public.eon_gmail_messages(user_id,gmail_message_id,internal_date,status)
 values(target_user_id,target_gmail_message_id,target_internal_date,'pending') on conflict(user_id,gmail_message_id) do nothing;
 update public.eon_gmail_messages m set status='processing',attempt_count=m.attempt_count+1,claim_token=token,
 claim_expires_at=now()+interval '5 minutes',next_retry_at=null,internal_date=coalesce(target_internal_date,m.internal_date),updated_at=now()
 where m.user_id=target_user_id and m.gmail_message_id=target_gmail_message_id and m.attempt_count<5
 and (m.status in ('pending','retry') and (m.next_retry_at is null or m.next_retry_at<=now()) or m.status='processing' and m.claim_expires_at<now())
 returning token,m.attempt_count into claim_token,attempt_count;
 return next;
end $$;

create or replace function public.finish_eon_gmail_message(target_user_id uuid,target_gmail_message_id text,target_claim_token uuid,target_status text,target_error_code text default null,target_attachment_sha256 text default null,target_import_batch_id uuid default null,target_internal_date timestamptz default null)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
 if target_status not in ('imported','duplicate','ignored','retry','failed') then raise exception 'EON_GMAIL_INVALID_TRANSITION'; end if;
 update public.eon_gmail_messages m set status=case when target_status='retry' and m.attempt_count>=5 then 'failed' else target_status end,error_code=left(target_error_code,80),attachment_sha256=target_attachment_sha256,
 import_batch_id=target_import_batch_id,internal_date=coalesce(target_internal_date,m.internal_date),claim_token=null,claim_expires_at=null,
 next_retry_at=case when target_status='retry' and m.attempt_count<5 then now()+least(interval '6 hours',interval '5 minutes'*power(2,greatest(m.attempt_count-1,0))) else null end,
 completed_at=case when target_status in('imported','duplicate','ignored','failed') or target_status='retry' and m.attempt_count>=5 then now() else null end,updated_at=now()
 where m.user_id=target_user_id and m.gmail_message_id=target_gmail_message_id and m.status='processing'
 and m.claim_token=target_claim_token and m.claim_expires_at>=now()
 and (target_status not in('imported','duplicate') or target_import_batch_id is not null);
 get diagnostics changed=row_count;if changed<>1 then return null;end if;return case when target_status='retry' and (select attempt_count from public.eon_gmail_messages where user_id=target_user_id and gmail_message_id=target_gmail_message_id)>=5 then 'failed' else target_status end;
end $$;
revoke all on function public.claim_eon_gmail_message(uuid,text,timestamptz),public.finish_eon_gmail_message(uuid,text,uuid,text,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_eon_gmail_message(uuid,text,timestamptz),public.finish_eon_gmail_message(uuid,text,uuid,text,text,text,uuid,timestamptz) to service_role;

create or replace function public.get_eon_gmail_status(target_user_id uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('mailbox_verified',coalesce(s.mailbox_verified,false),'last_run_at',s.last_run_at,'last_successful_import_at',coalesce(s.last_successful_import_at,(select max(completed_at) from public.eon_gmail_messages where user_id=target_user_id and status='imported')),'last_error_code',s.last_error_code,'counts',coalesce((select jsonb_object_agg(status,total) from(select status,count(*) total from public.eon_gmail_messages where user_id=target_user_id group by status)x),'{}'::jsonb)) from (select 1) seed left join public.eon_gmail_ingestion_state s on s.user_id=target_user_id;
$$;
revoke all on function public.get_eon_gmail_status(uuid) from public,anon,authenticated;
grant execute on function public.get_eon_gmail_status(uuid) to service_role;
