alter table public.tariff_settings
  add column heating_season_start_month smallint not null default 10
    check (heating_season_start_month between 1 and 12),
  add column heating_season_start_day smallint not null default 1
    check (heating_season_start_day between 1 and 31),
  add column heating_season_end_month smallint not null default 4
    check (heating_season_end_month between 1 and 12),
  add column heating_season_end_day smallint not null default 30
    check (heating_season_end_day between 1 and 31);

comment on column public.tariff_settings.heating_season_start_month is 'Fűtési szezon kezdő hónapja';
comment on column public.tariff_settings.heating_season_start_day is 'Fűtési szezon kezdő napja';
comment on column public.tariff_settings.heating_season_end_month is 'Fűtési szezon záró hónapja';
comment on column public.tariff_settings.heating_season_end_day is 'Fűtési szezon záró napja';
