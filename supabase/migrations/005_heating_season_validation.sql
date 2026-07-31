-- A 004 productionben már létrehozta az oszlopokat. Ez a migráció kizárólag
-- a hónaphoz tartozó maximális napot ellenőrző szigorú CHECK-eket adja hozzá.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'heating_season_start_date_valid'
      and conrelid = 'public.tariff_settings'::regclass
  ) then
    alter table public.tariff_settings
      add constraint heating_season_start_date_valid check (
        heating_season_start_day <= case
          when heating_season_start_month = 2 then 29
          when heating_season_start_month in (4, 6, 9, 11) then 30
          else 31
        end
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'heating_season_end_date_valid'
      and conrelid = 'public.tariff_settings'::regclass
  ) then
    alter table public.tariff_settings
      add constraint heating_season_end_date_valid check (
        heating_season_end_day <= case
          when heating_season_end_month = 2 then 29
          when heating_season_end_month in (4, 6, 9, 11) then 30
          else 31
        end
      ) not valid;
  end if;
end $$;

-- A jelenlegi 10/1 és 4/30 értékek érvényesek; a VALIDATE nem módosít adatot.
alter table public.tariff_settings validate constraint heating_season_start_date_valid;
alter table public.tariff_settings validate constraint heating_season_end_date_valid;
