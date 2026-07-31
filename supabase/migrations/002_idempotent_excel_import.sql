-- Az Excel-import az időszak kezdőnapja alapján ugyanazt a rekordot frissíti újrafuttatáskor.
alter table public.settlement_periods
  add constraint settlement_periods_user_start_unique unique (user_id, start_date);
