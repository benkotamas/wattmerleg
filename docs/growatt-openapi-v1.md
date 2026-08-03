# Growatt tokenes OpenAPI V1

Az integráció a közösségi [PyPi_GrowattServer](https://github.com/indykoning/PyPi_GrowattServer) tényleges Python implementációjával egyeztetett szerződést használja. A repository nem hivatalos Growatt-dokumentáció, ezért a szerződést maszkolt, read-only discoveryvel is ellenőriztük.

## Igazolt transport

- Európai base URL: `https://openapi.growatt.com/v1/`
- Auth header: `token`
- Auth érték: nyers token, Bearer prefix nélkül
- Response envelope: `error_code`, `error_msg`, `data`
- Siker: `error_code = 0` vagy `"0"`
- `10011`: nincs API-jogosultság
- `10012`: rate limit
- A Wattmérleg stabil, alkalmazásspecifikus User-Agentet használ.

## Read-only allowlist

Engedélyezett a plant lista/details/data/power/energy, a device lista, valamint a MIN (type 7) és SPH (type 5) detail/current-energy/history művelete. Beállításolvasó, beállításíró, inverter on/off és legacy login endpoint nincs az allowlistben.

A type 1 hagyományos inverterhez nincs igazolt device-specifikus V1 osztály. Ennél a típusnál a latest adapter kizárólag a típusfüggetlen `plant/data` és `plant/power` endpointokat használja. Más, nem támogatott típusnál kontrollált unsupported-device hiba keletkezik; nincs automatikus legacy fallback.

## Helyi discovery állapota – 2026-08-03

- A `plant/list` HTTP `200`, `error_code = 0` választ adott; egy plant található.
- A `device/list` HTTP `200`, `error_code = 0` választ adott; egy type 1 device található, a `model` és `status` mező elérhető.
- A `plant/data` HTTP `200`, `error_code = 0` választ adott. Igazolt stabil mezők: `total_energy`, `last_update_time`, `carbon_offset`, `efficiency`, `monthly_energy`, `peak_power_actual`, `timezone`, `current_power`, `yearly_energy`, `today_energy`.
- A `plant/power` HTTP `200`, `error_code = 0` választ adott. A response `time` és `power` mezőket tartalmaz; a forráskód szerződése szerint a `power` mértékegysége watt. A `measuredAt` az utolsó érvényes, nem jövőbeli rekord ideje.
- A `plant/energy` day, month és year minimális lekérdezése egyaránt HTTP `200`, `error_code = 0` választ adott. A stabil struktúra: `energys`, `count`, `time_unit`; a rekord mezői `date` és `energy`.
- Az energia-response nem tartalmazott külön unit mezőt. A normalizált energiaértékek kWh jelentését a V1 endpoint szerződése alapján kezeljük, nem a mezőnévből kikövetkeztetve.

Konkrét plant- vagy deviceazonosító, sorozatszám, név, cím, koordináta, energiaérték vagy nyers API-válasz nem került a dokumentációba.
