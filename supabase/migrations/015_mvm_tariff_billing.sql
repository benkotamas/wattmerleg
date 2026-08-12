alter table public.tariff_settings
  add column if not exists monthly_base_fee_ft numeric(14,3) not null default 153.035
  check (monthly_base_fee_ft >= 0);

alter table public.tariff_settings
  alter column discounted_price_ft set default 36.208,
  alter column market_price_ft set default 70.104;

-- Preserve user-customized tariffs while migrating the former application defaults.
update public.tariff_settings set discounted_price_ft = 36.208 where discounted_price_ft = 36;
update public.tariff_settings set market_price_ft = 70.104 where market_price_ft = 70.1;

comment on column public.tariff_settings.monthly_base_fee_ft is
  'MVM havi bruttó alapdíj (Ft), a számlázási napokra arányosítva';
