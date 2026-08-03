# P1 Meter bővítési alap

A havi `solar_monthly_analysis_snapshots` elemzési modell forrásfüggetlen. A jelenlegi rekordok `meter_source = manual_readings` értékkel jelzik, hogy kézi villanyóra-állások havi, esetenként időarányos felosztásából készültek. Nem állítanak P1 pontosságot, és nem vesznek részt tarifa-, számla- vagy elszámolási számításban.

Egy későbbi `p1_energy_intervals` tábla várható mezői: `user_id`, `interval_start`, `interval_end`, `grid_import_kwh`, `grid_export_kwh`, `average_import_power_w`, `average_export_power_w`, `source`, `quality_status`. Ebből napi, órás vagy 15 perces önfogyasztás, napszakos profil és fogyasztás-időzítési ajánlás készülhet. A Napelem nézet felbontásválasztója ezért már Havi/Napi/Órás irányban bővíthető; jelenleg csak a Havi aktív.
