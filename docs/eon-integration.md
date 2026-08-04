# E.ON 15 perces adatok

A 012 production migráció előtt kötelező a helyi PostgreSQL-kapu: állítsd az `EON_GMAIL_TEST_DATABASE_URL` értékét kizárólag localhost/127.0.0.1/::1 Supabase adatbázisra, legyen elérhető a `psql`, majd futtasd az `npm run test:eon-gmail-db` parancsot. A runner adatbázis vagy konfiguráció nélkül hibával áll le, külön tesztfelhasználót és semleges message ID-kat használ, végül törli a tesztfelhasználót és a hozzá tartozó rekordokat.

Az üzenetenkénti Gmail-kérések felső határa: egy metadata-kérés, egy body-adat nélküli strukturális full kérés, és csak `attachmentId` nélküli XLSX esetén még egy inline-fallback full kérés. Egy futás legfeljebb öt claimelt üzenetet kezel, ezért maximum öt metadata-, öt strukturális full- és öt inline-fallback kérés lehetséges. `attachmentId` esetén nincs inline fallback, csak az egyetlen `attachments.get` kérés.

Release-korlátok: egy Gmail-futás legfeljebb öt levelet dolgoz fel. A listázás fixen legfeljebb 5 oldalt / 50 azonosítót vizsgál; a Gmail API találati sorrendjére nem épít üzleti garanciát. Az esedékes retry rekordok külön, legfeljebb ötös adatbázislistából elsőbbséget kapnak. Ha további Gmail-oldal marad, az állapot `EON_GMAIL_SCAN_LIMIT_REACHED` jelzést kap. A claim megelőzi a szűk metadata-kérést; csak érvényes claim után ellenőrizzük a feladót és az `internalDate` értéket, majd indulhat teljes MIME-letöltés.

Az automatikus import alapértelmezett időszakkorlátja 7 nap (`GMAIL_EON_MAX_WORKBOOK_DAYS`), a levél dátumához képest engedett késés 14 nap (`GMAIL_EON_MAX_PERIOD_LAG_DAYS`). Ezek az E.ON rövid exportjaira adnak konzervatív mozgásteret; a kézi XLSX-importot nem korlátozzák.

## Gmail ingestion (012)

Az integráció kizárólag `gmail.readonly` jogosultságot kér. Legfeljebb 50 találatot vizsgál és futásonként 5 claimelt üzenetet dolgoz fel. A korlátos találati ablak megfordítása nem jelent Gmail által garantált kronológiai sorrendet. A MIME-fa mélysége és elemszáma korlátozott; pontosan egy XLSX engedélyezett. XLS, XLSM, ZIP, túlméretes vagy több melléklet nem jut el a parserhez. A fájl ezután a közös `importEonWorkbook` folyamatba kerül.

A `012_eon_gmail_ingestion.sql` tartós lease/claim állapotgépet hoz létre; manuálisan, a 011 után kell futtatni. A cron naponta 08:15 UTC-kor fut. A várt Gmail-címet a `/profile` válasszal szerveroldalon ellenőrzi, a `GMAIL_EON_ALLOWED_FROM` pedig pontos feladó-allowlist: a szerver a queryt és a letöltött `From` headert is ellenőrzi. Emailcímet nem tárol és nem ad vissza. A CLI explicit a projektgyökér `.env.local` fájlját tölti be, a meglévő process environmentet nem írja felül. A production route-okhoz Vercelben Production-only `SUPABASE_SERVICE_ROLE_KEY` szükséges; ez soha nem lehet `NEXT_PUBLIC_` változó.

A Wattmérleg nem használja a korábbi, elavult W1000 közvetlen login- és `ProfileData` folyamatot. A kézi feltöltés fallback; a Gmail-feldolgozó ugyanazt a keményített `importEonWorkbook` szolgáltatást használja.

Az exportban a `+A` a hálózatból vételezett, a `-A` a hálózatba betáplált energiát jelenti kWh/15 perc egységben. Egy teljes helyi nap normálisan 96, a tavaszi óraátállításkor 92, az őszi visszaállításkor 100 intervallum. Az aktuális, még nyitott nap `provisional`; egy lezárt, hiányos nap `incomplete`.

Az import SHA-256 alapján felismeri ugyanazt a mellékletet, az átfedő exportokat pedig `user_id + interval_start_utc` kulccsal idempotensen egészíti ki vagy frissíti. A teljes fájl, nyers sorok, eredeti fájlnév, POD-, partner- és mérőazonosító nem kerül adatbázisba vagy publikus válaszba.

Az E.ON intervallumadat egyelőre kizárólag analitikai adatforrás. Nem írja felül a kézi mérőállásokat, és nem módosít tarifa-, számla- vagy éves elszámolási számítást. A kézi mérőállás marad a hivatalos pénzügyi forrás.

## Ismert DST-korlát

Az őszi, 96 soros E.ON-forrásnap hiányos forrásnapként marad; a rendszer nem becsüli ki a hiányzó intervallumokat. A már ismert tavaszi DST-fájlt a jelenlegi parser blokkolja, és blocking erroros fájlt a Gmail-import sem menthet. A tavaszi DST parserillesztés külön következő feladat.

Az XLSX-feldolgozás a SheetJS hivatalos `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` csomagját használja a repositoryban rögzített `vendor/xlsx-0.20.3.tgz` fájlból. A tarball SHA-256 értéke `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`, a package-lock SHA-512 integrity mezője pedig `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`. Ez váltotta az npm registryben megrekedt 0.18.5 verziót, amelyet prototype-pollution és ReDoS advisory érintett. A vendorizálás miatt a build nem függ a külső CDN pillanatnyi elérhetőségétől.

Az E.ON parser előtt külön, szinkron ZIP-preflight fut. Minden central-directory rekordot a hozzá tartozó local file headerrel egyeztet: a név, flags, compression method, CRC32, tömörített és kibontott méret csak teljes egyezéssel fogadható el, a tartományok nem lóghatnak a central directoryba és nem fedhetik át egymást. Ezután minden stored payloadot közvetlenül, minden DEFLATE payloadot korlátozott `inflateRawSync` hívással ténylegesen ellenőriz. A tényleges output hosszának és CRC32 értékének egyeznie kell a headerekkel; az entry-, összméret- és tömörítésiarány-limit a tényleges outputra is vonatkozik. Limitjei: legfeljebb 10 MiB feltöltés, 2000 ZIP-entry, entrynként 16 MiB, összesen 40 MiB ténylegesen kibontott méret, legfeljebb 200:1 tényleges és deklarált tömörítési arány, 12 munkalap, 100 000 sor, 64 oszlop és 500 000 tényleges cella. Tiltott a path traversal, abszolút/meghajtós/UNC útvonal, duplikált normalizált név, titkosított vagy data descriptoros entry, többkötetes ZIP és minden ZIP64-jelölés. Tiltott továbbá a VBA, ActiveX, embedding, ctrlProps és externalLinks tartalom. A képek és rajzok nem kerülnek a kontrollált DTO-ba, és a parser nem követ hálózati hivatkozást.

Képleteket a rendszer nem értékel, és cached value jelenlétében is elutasítja a képletcellát (`EON_FORMULA_CELL`). A parser kizárólag Bufferből dolgozik, nem ír ideiglenes fájlt, nincs hálózati vagy adatbázis-hozzáférése, nem olvas környezeti credentialt, és csak allowlistelt parse DTO-t ad vissza. Külön worker/child process nem készült: a rögzített javított parserverzió és a kibontás előtti szigorú szerkezeti limitek Vercel alatt egyszerűbb, reprodukálhatóbb határt adnak.

Az XLSX ZIP-tartalma kétszer kerül memóriabeli kibontásra: először a biztonsági preflight ellenőrzi a tényleges hosszakat és CRC-ket, majd a már ellenőrzött, legfeljebb 10 MiB-os bemenetet a SheetJS dolgozza fel saját sor-, oszlop-, cella- és tartalomkorlátokkal. Egyik lépés sem írja ki a fájlokat a fájlrendszerre.

Az XLSX parserfüggőség ismert 0.18.5-ös kockázata ezzel megszűnt. A Gmail-integráció ugyanennek a parsernek a biztonsági korlátait használja.
# DST és aktuális elszámolási időszak (013)

A szigorúan felismerhető tavaszi E.ON 96 soros sablon négy üres értékpárját a parser nem mérésként kezeli, a 92 értékpárt pedig forrássorrendben rendeli a 92 valódi Europe/Budapest intervallumhoz (`DST_SPRING_TEMPLATE_ALIGNED`). Eltérő minta blokkoló, becslés nincs. Az őszi, 96/100-as forráskorlát hiányos nap marad (`DST_FALLBACK_SOURCE_96`), mesterséges rekord nem készül.

A 013 migráció pontos `opening_reading_at` határt és owner-only `get_current_eon_period_overview()` RPC-t ad. Az E.ON összesítés kizárólag analitikai; a pénzügyi elszámolás változatlanul a kézi mérőállásokon alapul.
