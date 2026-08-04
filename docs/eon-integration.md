# E.ON 15 perces adatok

A Wattmérleg nem használja a korábbi, elavult W1000 közvetlen login- és `ProfileData` folyamatot. A jelenlegi fő adatforrás az E.ON portál ütemezett XLSX-exportja. A kézi feltöltés teszt- és fallback funkció; a 012-es fázisban ugyanazt az import service-t Gmail OAuth-feldolgozás hívhatja majd.

Az exportban a `+A` a hálózatból vételezett, a `-A` a hálózatba betáplált energiát jelenti kWh/15 perc egységben. Egy teljes helyi nap normálisan 96, a tavaszi óraátállításkor 92, az őszi visszaállításkor 100 intervallum. Az aktuális, még nyitott nap `provisional`; egy lezárt, hiányos nap `incomplete`.

Az import SHA-256 alapján felismeri ugyanazt a mellékletet, az átfedő exportokat pedig `user_id + interval_start_utc` kulccsal idempotensen egészíti ki vagy frissíti. A teljes fájl, nyers sorok, eredeti fájlnév, POD-, partner- és mérőazonosító nem kerül adatbázisba vagy publikus válaszba.

Az E.ON intervallumadat egyelőre kizárólag analitikai adatforrás. Nem írja felül a kézi mérőállásokat, és nem módosít tarifa-, számla- vagy éves elszámolási számítást. A kézi mérőállás marad a hivatalos pénzügyi forrás.

## Későbbi Gmail-fázis

A parser fájlnév és HTTP-route nélkül, byte-tömbből működik. A későbbi Gmail-feldolgozó ugyanazt az `importEonWorkbook({ userId, bytes, source: "eon_portal_export", externalMessageId })` service-t hívhatja. Ebben a fázisban nincs Gmail SDK, OAuth-változó vagy cron.

Az XLSX-feldolgozás a SheetJS hivatalos `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` csomagját használja a repositoryban rögzített `vendor/xlsx-0.20.3.tgz` fájlból. A tarball SHA-256 értéke `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`, a package-lock SHA-512 integrity mezője pedig `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`. Ez váltotta az npm registryben megrekedt 0.18.5 verziót, amelyet prototype-pollution és ReDoS advisory érintett. A vendorizálás miatt a build nem függ a külső CDN pillanatnyi elérhetőségétől.

Az E.ON parser előtt külön, szinkron ZIP-preflight fut. Minden central-directory rekordot a hozzá tartozó local file headerrel egyeztet: a név, flags, compression method, CRC32, tömörített és kibontott méret csak teljes egyezéssel fogadható el, a tartományok nem lóghatnak a central directoryba és nem fedhetik át egymást. Ezután minden stored payloadot közvetlenül, minden DEFLATE payloadot korlátozott `inflateRawSync` hívással ténylegesen ellenőriz. A tényleges output hosszának és CRC32 értékének egyeznie kell a headerekkel; az entry-, összméret- és tömörítésiarány-limit a tényleges outputra is vonatkozik. Limitjei: legfeljebb 10 MiB feltöltés, 2000 ZIP-entry, entrynként 16 MiB, összesen 40 MiB ténylegesen kibontott méret, legfeljebb 200:1 tényleges és deklarált tömörítési arány, 12 munkalap, 100 000 sor, 64 oszlop és 500 000 tényleges cella. Tiltott a path traversal, abszolút/meghajtós/UNC útvonal, duplikált normalizált név, titkosított vagy data descriptoros entry, többkötetes ZIP és minden ZIP64-jelölés. Tiltott továbbá a VBA, ActiveX, embedding, ctrlProps és externalLinks tartalom. A képek és rajzok nem kerülnek a kontrollált DTO-ba, és a parser nem követ hálózati hivatkozást.

Képleteket a rendszer nem értékel, és cached value jelenlétében is elutasítja a képletcellát (`EON_FORMULA_CELL`). A parser kizárólag Bufferből dolgozik, nem ír ideiglenes fájlt, nincs hálózati vagy adatbázis-hozzáférése, nem olvas környezeti credentialt, és csak allowlistelt parse DTO-t ad vissza. Külön worker/child process nem készült: a rögzített javított parserverzió és a kibontás előtti szigorú szerkezeti limitek Vercel alatt egyszerűbb, reprodukálhatóbb határt adnak.

Az XLSX ZIP-tartalma kétszer kerül memóriabeli kibontásra: először a biztonsági preflight ellenőrzi a tényleges hosszakat és CRC-ket, majd a már ellenőrzött, legfeljebb 10 MiB-os bemenetet a SheetJS dolgozza fel saját sor-, oszlop-, cella- és tartalomkorlátokkal. Egyik lépés sem írja ki a fájlokat a fájlrendszerre.

Az XLSX parserfüggőség ismert 0.18.5-ös kockázata ezzel megszűnt. Ez a parseroldali előfeltételt teljesíti, de Gmail OAuth, feladó- és melléklet-allowlist, üzenet-idempotencia és cron továbbra sincs implementálva; ezért az automatikus Gmail-import még nincs bekapcsolva.
