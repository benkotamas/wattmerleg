# Growatt historikus napi termelés – technikai terv

## Cél és hatókör

A következő fejlesztési fázis napi Growatt PV-termelési adatok biztonságos tárolását készítheti el, hogy azok később azonos helyi naptári időszakokra összevethetők legyenek a villanyóra mérőállás-különbségeivel. Ez a dokumentum terv: jelenleg nincs historikus tábla, szinkron, cron vagy automatikus számítás.

Az inverteradat külön információforrás marad. Nem írhatja felül a villanyórás fogyasztást, visszatáplálást, éves energiamérleget, tarifát vagy szolgáltatói számlabecslést.

## Adatforrás

Elsődleges forrás a Growatt OpenAPI V1 `GET plant/energy` napi felbontása (`time_unit=day`). A havi és éves lekérdezés ellenőrző vagy összesítő célra használható, de nem helyettesíti a napi tényadatot. Napi historikus sor nem épülhet a pillanatnyi teljesítményből vagy a current/latest minták integrálásából.

A tényleges implementáció előtt maszkolt discoveryvel ellenőrizni kell a napi endpoint dátumparamétereit, válaszmezőit, lapozását, maximális tartományát, rate limitjét és azt, közöl-e forrásoldali utolsó módosítási időt. Nem dokumentált korlátot nem szabad feltételezni.

## Javasolt Supabase-adatmodell

Javasolt tábla: `growatt_daily_energy`.

| Mező | Javasolt típus | Szerep |
| --- | --- | --- |
| `id` | `uuid` | Belső elsődleges kulcs |
| `user_id` | `uuid` | Tulajdonos, `auth.users` hivatkozás |
| `local_date` | `date` | A plant időzónájának helyi naptári napja |
| `energy_kwh` | `numeric` | Napi inverteres össztermelés, nem negatív |
| `plant_timezone` | `text` | A nap értelmezéséhez használt IANA-időzóna |
| `source` | `text` | Például `growatt_openapi_v1` |
| `fetched_at` | `timestamptz` | Utolsó sikeres lekérés |
| `api_last_update_at` | `timestamptz null` | Csak ha az API igazoltan biztosítja |
| `quality_status` | `text` | Például `provisional`, `final`, `warning` |
| `created_at` | `timestamptz` | Létrehozás |
| `updated_at` | `timestamptz` | Utolsó módosítás |

Egyedi kulcs: `(user_id, local_date)`. RLS kötelező; a felhasználó kizárólag saját sorait olvashatja. Írást célszerű hitelesített, tulajdonoshoz kötött szerveroldali szinkronon keresztül végezni. Nyers API-válasz nem tárolható.

Egyetlen szerveroldalon automatikusan feloldott integrációnál plant- vagy eszközazonosító tárolása nem szükséges. Több integráció későbbi támogatásakor egy belső, nem publikus kapcsolatkulcs vagy az azonosító egyirányú, kulcsolt lenyomata mérlegelhető; nyers azonosító csak igazolt technikai szükség esetén kerülhet szerveroldali tárolásba.

## Időzóna és napképzés

`local_date` mindig a Growatt plant ellenőrzött IANA-időzónája alapján képzett dátum. Nem származhat a Vercel folyamat lokális vagy UTC naptári napjából. A szinkron explicit időzónával generálja a kért napokat, és ugyanazt az időzónát menti a rekord mellé.

A DST miatt egy helyi nap 23 vagy 25 órás lehet, de továbbra is pontosan egy `local_date` rekordot jelent. A dátumalapú egyedi kulcs megakadályozza a duplikációt. Időzónaváltás esetén a korábbi sorok eredeti `plant_timezone` értéke megmarad; az érintett határnapokat külön újra kell ellenőrizni.

## Upsert és idempotencia

Az írás `(user_id, local_date)` konfliktuskulcsú upsert. Az ismételt azonos lekérés nem hoz létre új sort, hanem frissíti az energiát, a minőségi állapotot, a forrásoldali módosítási időt és a `fetched_at`/`updated_at` mezőt.

Az aktuális nap `provisional`, mert nap közben változik, ezért újra lekérhető. A tegnapi napot a következő futás ismét ellenőrzi, majd stabil eredmény esetén lezárható. Régebbi napok ritkább, kis mintás újraellenőrzése javíthatja az utólagos Growatt-korrekciókat anélkül, hogy minden futás újratöltené a teljes történetet.

## Backfill

A visszamenőleges import csak explicit felhasználói művelettel induljon, kis – az igazolt API-korláthoz igazított – dátumablakokban. Az első verzió ne indítson automatikus többéves importot.

A folyamat javasolt állapota: kért tartomány, következő feldolgozandó nap/ablak, sikeres és hibás napok száma, utolsó biztonságos checkpoint, megszakítási jelző. Újraindításkor a checkpointtól folytat, miközben az idempotens upsert a már feldolgozott napokat is biztonságossá teszi.

Retry kizárólag timeout, rate limit és átmeneti 5xx hiba esetén történjen, korlátozott exponenciális visszalépéssel és jitterrel. Auth-, permission-, konfigurációs vagy hibás válasz esetén a folyamat álljon meg. A Growatt által közölt `Retry-After` elsődleges. A token, azonosítók, címadatok és nyers válasz sem logba, sem progress rekordba nem kerülhet.

## Frissítési stratégia

- **Kézi frissítés:** jól ellenőrizhető és olcsó, de a felhasználó aktivitásától függ.
- **Vercel Cron:** rendszeres, de külön route-védelmet, titkos cron-hitelesítést, rate-limit kontrollt és futási megfigyelést igényel.
- **Napi szerveroldali szinkron:** a legjobb hosszú távú alap; egyszer frissíti az aktuális és előző napot, plusz ritkán néhány régi napot.
- **Mérőállás-rögzítéskori opportunista frissítés:** hasznos kiegészítő, de nem lehet az egyetlen mechanizmus, mert a mérés ritka és a felhasználói műveletet nem szabad lassítania.

Az egyfelhasználós alkalmazáshoz javasolt sorrend: először kézi, kis tartományú szinkron és backfill; stabil működés után napi egyszeri védett szerveroldali szinkron. A mérőállás-rögzítés legfeljebb háttérben kérhet frissítést. Cron-konfiguráció csak a kézi folyamat, a rate limit és a monitoring igazolása után készüljön.

## Későbbi számítások

Csak teljesen azonos helyi naptári időszakra és teljes adatlefedettségnél számolható:

- becsült helyben felhasznált PV = PV-termelés − hálózati visszatáplálás;
- becsült teljes házfogyasztás = hálózati vételezés + PV-termelés − hálózati visszatáplálás;
- PV önfogyasztási arány = becsült helyben felhasznált PV / teljes PV-termelés;
- PV fedezeti arány = becsült helyben felhasznált PV / becsült teljes házfogyasztás.

Negatív vagy fizikailag ellentmondásos eredmény `0`-ra clampelés helyett minőségi warningot és nem számítható eredményt adjon. Nulla nevező, hiányos nap, eltérő időzóna vagy eltérő időszak esetén százalék nem készülhet. A mérőállás-intervallum és a napi Growatt-sorok kezdő/záró helyi határának pontosan egyeznie kell; nem felosztható periodhatár-átlépést ki kell zárni vagy külön megjelölni.

Minden eredmény „becsült” címkét kap. Az inverter és a villanyóra eltérő mérési pontja, pontossága, lekerekítése és frissítési ideje miatt az egyezés önmagában sem bizonyít tökéletes fizikai felosztást.

## Pénzügyi és fűtési leválasztás

A Growatt-adat nem módosítja a hivatalos villanyórás éves egyenleget, tarifaszámítást vagy szolgáltatói számlabecslést. Külön elemzési mutatóként később megjelenhet a „helyben felhasznált napenergia becsült elkerült vásárlási költsége”, de ez nem számlatétel.

A napi PV-termelés később segíthet a historikus fűtési elemzés PV-korrekciójában. A korrekció csak mérési bizonytalanságot csökkenthet; nem állíthatja, hogy minden helyben felhasznált napenergia fűtési energia volt.

## Biztonság és adatvédelem

Az API-token kizárólag szerveroldali környezeti változó. Owner-ellenőrzés, normalizált hibák, minimális jogosultság, RLS és auditálható szerveroldali írás szükséges. A kliens és az adatbázis nem kap tokent, nyers API-választ, címet, koordinátát vagy szükségtelen eszközazonosítót. Logokban csak dátumtartomány, darabszám, állapot és maszkolt technikai korrelációs azonosító szerepelhet.

## Javasolt fejlesztési fázisok

1. A napi `plant/energy` szerződés read-only, maszkolt ellenőrzése és tesztfixture készítése.
2. Új migráció: tábla, constraint-ek, index, RLS és ownerhez kötött írási út.
3. Napi mapper, időzóna-kezelés, idempotens upsert és unit/integrációs tesztek.
4. Kézi, kis tartományú szinkron progresszel és megszakítható backfilllel.
5. Lefedettség- és adatminőség-ellenőrzés, majd külön becsült PV-statisztikák.
6. Stabil működés után védett napi szerveroldali szinkron; csak ezt követően opcionális fűtési PV-korrekció.
