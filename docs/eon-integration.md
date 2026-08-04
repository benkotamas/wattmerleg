# E.ON 15 perces adatok

A Wattmérleg nem használja a korábbi, elavult W1000 közvetlen login- és `ProfileData` folyamatot. A jelenlegi fő adatforrás az E.ON portál ütemezett XLSX-exportja. A kézi feltöltés teszt- és fallback funkció; a 012-es fázisban ugyanazt az import service-t Gmail OAuth-feldolgozás hívhatja majd.

Az exportban a `+A` a hálózatból vételezett, a `-A` a hálózatba betáplált energiát jelenti kWh/15 perc egységben. Egy teljes helyi nap normálisan 96, a tavaszi óraátállításkor 92, az őszi visszaállításkor 100 intervallum. Az aktuális, még nyitott nap `provisional`; egy lezárt, hiányos nap `incomplete`.

Az import SHA-256 alapján felismeri ugyanazt a mellékletet, az átfedő exportokat pedig `user_id + interval_start_utc` kulccsal idempotensen egészíti ki vagy frissíti. A teljes fájl, nyers sorok, eredeti fájlnév, POD-, partner- és mérőazonosító nem kerül adatbázisba vagy publikus válaszba.

Az E.ON intervallumadat egyelőre kizárólag analitikai adatforrás. Nem írja felül a kézi mérőállásokat, és nem módosít tarifa-, számla- vagy éves elszámolási számítást. A kézi mérőállás marad a hivatalos pénzügyi forrás.

## Későbbi Gmail-fázis

A parser fájlnév és HTTP-route nélkül, byte-tömbből működik. A későbbi Gmail-feldolgozó ugyanazt az `importEonWorkbook({ userId, bytes, source: "eon_portal_export", externalMessageId })` service-t hívhatja. Ebben a fázisban nincs Gmail SDK, OAuth-változó vagy cron.

Az XLSX-feldolgozás biztonsági határai: a kézi route csak a hitelesített tulajdonos számára érhető el, a fájlméret, munkalapszám és sorszám korlátozott. A használt `xlsx@0.18.5` csomag ismert auditkockázata miatt az automatikus Gmail-mellékletfeldolgozás nem kapcsolható be addig, amíg a parserfüggőség kockázatát frissítéssel, cserével vagy külön izolációval meg nem szüntettük. `npm audit fix --force` ebben a fázisban nem futott.
