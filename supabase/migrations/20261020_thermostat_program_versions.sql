-- Q7RF manually entered weekly schedule revisions; additive, RLS-protected.
create table if not exists public.thermostat_program_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_from date not null,
  thermostat_model text not null default 'COMPUTHERM Q7RF',
  weekly_program jsonb not null,
  note text,
  created_at timestamptz not null default now(),
  unique(user_id,effective_from),
  constraint weekly_program_array check (jsonb_typeof(weekly_program)='array'),
  constraint thermostat_model_length check (length(thermostat_model) between 1 and 100)
);
create index if not exists thermostat_program_versions_user_date_idx
  on public.thermostat_program_versions(user_id,effective_from desc);
alter table public.thermostat_program_versions enable row level security;
create policy "Owners view thermostat programs" on public.thermostat_program_versions
  for select to authenticated using (auth.uid()=user_id);
create policy "Owners insert thermostat programs" on public.thermostat_program_versions
  for insert to authenticated with check (auth.uid()=user_id);
create policy "Owners edit thermostat programs" on public.thermostat_program_versions
  for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Owners delete thermostat programs" on public.thermostat_program_versions
  for delete to authenticated using (auth.uid()=user_id);
