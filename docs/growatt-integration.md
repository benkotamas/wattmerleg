# Growatt / ShinePhone integráció

## Latest cache és Vercel

A `/api/growatt/latest` autentikáció és tulajdonos-ellenőrzés után éri el a cache-t. A Next.js Data Cache (`unstable_cache`) a Vercel által megosztott réteg: a publikus latest DTO-t és a rate-limit sentinelt tárolja, belső Growatt-azonosítót vagy tokent nem.

Az azonos fingerprinthez tartozó process-local Map csak best-effort single-flight és stale fallback. Ez csökkenti az egy példányon belüli párhuzamos hívásokat, de a korábbi sikeres stale adat Vercel serverless példányok közötti megőrzése nem garantált. A böngésző allowlistelt localStorage snapshotja ettől független kliensoldali fallback.

## Igazolt állapot

2026-08-02-án nyilvánosan elérhető hivatalos forrásból az alábbiak voltak igazolhatók:

- a hivatalos globális szolgáltatás az `https://openapi.growatt.com/` portálon érhető el;
- a Growatt installer dokumentáció tokennel elérhető API-hozzáférést említ;
- a portál plant-, device-, aktuális és historikus adatnézeteket biztosít.

A publikus dokumentációból nem volt igazolható az API base URL-je, a token header/formátuma, a plant/device/latest/history endpoint pontos útvonala vagy a nyers JSON mezők szerződése. Ezek ezért nincsenek hardcode-olva.

## Biztonsági modell

A token kizárólag `GROWATT_API_TOKEN` szerveroldali environment változóból olvasható. A kliens nem adja vissza és nem naplózza a tokent vagy a külső API nyers hibaüzenetét. A route-okat a meglévő Supabase middleware sessionvédeleme fedi.

Az endpointok és a mezőtérkép csak a fiókhoz tartozó hivatalos OpenAPI dokumentáció ellenőrzése után állítható be. A szerveroldali változók az `.env.example` fájlban találhatók. Az auth érték `{token}` vagy például `Bearer {token}` template lehet; kizárólag a szerveren kerül kiértékelésre.

## Discovery

```powershell
npm run growatt:discover -- --base-url https://HIVATALOS-BASE --auth-header HIVATALOS-HEADER --plants-path /HIVATALOS-PLANT-PATH
```

A script csak a válasz kulcsait, típusait és listasorszámokat írja ki. Tokent, azonosítót és nyers értéket nem ír ki. A device/latest útvonalat csak az így kapott struktúra és a hivatalos dokumentáció együttes ellenőrzése után szabad konfigurálni.

A transport `GET` és általános JSON `POST` kérést támogat. A discoveryben `--method`, ismételhető `--query key=value`, valamint `--body-file` használható. Ezek nem jelentenek Growatt-specifikus POST body feltételezést.

## API route-ok

- `GET /api/growatt/status`: 5 perces process-memory cache; plant konfigurációval már működik, a deviceszám csak device konfiguráció esetén jelenik meg.
- `GET /api/growatt/latest`: 2 perces process-memory cache; egyetlen egyértelmű plant és device normalizált latest adata.

Több plant vagy device esetén a latest szolgáltatás `GROWATT_UNSUPPORTED_DEVICE` hibát ad; nem választ véletlenszerűen. Mindkét route a middleware mellett közvetlen Supabase session-ellenőrzést is végez, és bejelentkezés nélkül JSON `401` választ ad.

A cache-kulcs nem érzékeny konfiguráció-fingerprintet tartalmaz: base URL, endpointok, auth header neve és mezőtérképek. A token nem része a fingerprintnek.

## Normalizált adatok és későbbi számítások

Az integráció csak a konfigurált mezőtérképben ténylegesen megtalált adatokat tölti. Minden más mező `null`; a `rawCapabilities` felsorolja a ténylegesen jelen lévő képességeket.

A későbbi PV-helyi felhasználáshoz legalább az inverter időszaki össztermelése és a villanyóra azonos időszaki visszatáplálása szükséges. Teljes házfogyasztáshoz ezen felül az azonos időintervallumú hálózati vételezés kell. Aktuális power mezők nem helyettesítik az időszaki energiát, és invertertermelésből önmagában nem következik a házfogyasztás, import vagy export. Az időzóna, mérési felbontás, hiányzó minták és számláló-resetek külön adatminőségi kérdések.

Adatbázis-tárolás és üzleti számítás ebben a körben nem készült.
