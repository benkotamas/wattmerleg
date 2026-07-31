# Wattmérleg

Mobil-first Next.js alkalmazás az otthoni áramfogyasztás és napelemes visszatáplálás nyilvántartására. A felület magyar nyelvű, Supabase-belépéssel védett, Vercelre telepíthető és PWA-ként hozzáadható a kezdőképernyőhöz.

## Funkciók

- aktuális elszámolási időszak fogyasztása, termelése, egyenlege és becsült díja;
- napi átlagok, előző időszaki összehasonlítás és éves előrejelzés;
- mobilos mérőállás-rögzítés, növekvő óraállás- és dátumellenőrzéssel;
- mérési előzmények szerkesztése és törlése;
- választható nézetű, időarányosan becsült havi statisztika és grafikon;
- hónap szerint szűrhető mérési előzmények;
- adatbázisból szerkeszthető tarifák, biztonsági alapértékekkel;
- korábbi évek havi mintáira épülő szezonális fogyasztási és termelési előrejelzés;
- konfigurálható fűtési szezon és többéves fűtésifogyasztás-összehasonlítás;
- az éves elszámolási időszaktól független, teljes következő fűtési szezon forecast;
- manuális, tranzakciós éves zárás, az utolsó mérés továbbvitelével;
- egyszer futtatható, hibatűrő Excel-import;
- Supabase email/jelszó belépés és sor-szintű adatvédelem (RLS).

## 1. Helyi indítás

Node.js 20 vagy újabb szükséges.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Ezután nyisd meg a `http://localhost:3000` címet.

## 2. Supabase projekt létrehozása

1. Hozz létre egy új projektet a Supabase Dashboardon.
2. A **Project Settings → API** részen másold ki a Project URL-t és a publikus anon/publishable kulcsot.
3. A projekt gyökerében hozz létre `.env.local` fájlt:

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJEKT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=PUBLIKUS_KULCS
```

A `SUPABASE_SERVICE_ROLE_KEY` kizárólag az importhoz kell. Ezt ne tedd `NEXT_PUBLIC_` változóba, és ne commitold.

## 3. Adatbázis-migráció

A Supabase Dashboard **SQL Editor** felületén sorrendben futtasd le a `supabase/migrations` mappában lévő migrációkat. Productionben a `004_heating_season_forecast.sql` már létrehozta a négy fűtésiszezon-mezőt. Frissítéskor csak az új `005_heating_season_validation.sql` migrációt futtasd: ez adatváltoztatás nélkül, idempotens módon hozzáadja és validálja a szigorú hónap/nap CHECK-korlátokat. A `001`–`004` migrációkat ne futtasd újra.

Alternatívaként, telepített Supabase CLI-val:

```bash
supabase link --project-ref PROJEKT_AZONOSITO
supabase db push
```

## 4. Első felhasználó

1. Supabase Dashboard → **Authentication → Users**.
2. Válaszd az **Add user → Create new user** műveletet.
3. Adj meg emailcímet és erős jelszót, és jelöld az emailt megerősítettnek.
4. Másold ki a létrehozott felhasználó UUID-jét; az Excel-importhoz szükséges.

Regisztrációs oldal szándékosan nincs. Bejelentkezés nélkül az adatoldalak nem érhetők el, az RLS pedig adatbázis-szinten is csak a saját adatokat engedi.

## 5. Excel-import

Az eredeti fájlt az import nem módosítja. Másold az `.xlsx` fájlt a `data` mappába, majd az `.env.local` fájlhoz add hozzá:

```env
SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KULCS
SUPABASE_USER_ID=AZ_ELOZO_LEPESBEN_MASOLT_UUID
# Opcionális, ha több fájl van:
EXCEL_FILE=data/meresek.xlsx
```

Futtatás:

```bash
npm run import:excel
```

A script a munkafüzet tényleges felépítését ellenőrzi: az `Adat` lap 2. sorának fejlécét, az A/B/C/E oszlopokat, a K oszlop megjegyzéseit, valamint a D/F képletek bázissorait. Kiírja a sikeres, kihagyott és figyelmeztetéses sorokat, továbbá minden felismert időszak határait és mérőállásait. A service role kulcsot az import után töröld a helyi környezetből. Az import a felhasználó + időszakkezdés és a felhasználó + mérési időpont alapján újrafuttatható, duplikáció nélkül.

Adatbázis-módosítás nélküli ellenőrzés:

```bash
npm run import:excel -- --dry-run
```

## 6. Ellenőrzések

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Az energiaárak, az éves limit, a zárási nap és a fűtési szezon határai a `tariff_settings` táblában módosíthatók a Beállítások oldalról. A `lib/config.ts` csak adatbázis-hiba vagy még le nem futtatott migráció esetére tartalmaz biztonsági alapértékeket. A forecast eredmények dinamikusan készülnek, nem kerülnek adatbázisba.

A fűtési szezon szélső hónapjai naparányosan számítódnak. Február 29 érvényes évfüggetlen beállítás; nem szökőévben a számítás február 28-ra clampeli. A következő fűtési szezon forecastja nem áll meg az aktuális éves elszámolás zárásánál.

Negatív mérődeltát a havi statisztika mérőnként külön kihagy és megjelöl. A normál statisztikai UI megtartja az adott hónap többi érvényes részét, de a szezonális forecast tanítómintájából az érintett mérő teljes év–hónap mintája kimarad. A fogyasztás és termelés külön mintaszámmal és confidence-szel rendelkezik.

## 7. Vercel telepítés

1. Töltsd fel a projektet egy GitHub repóba.
2. A Vercel Dashboardon válaszd az **Add New → Project** lehetőséget, majd importáld a repót.
3. Framework Preset: **Next.js**; a Build Command maradhat `next build`.
4. Add hozzá a Production, Preview és Development környezetekhez:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Ne add hozzá a `SUPABASE_SERVICE_ROLE_KEY` változót a Vercelhez; a webalkalmazásnak nincs rá szüksége.
6. Indítsd el a deploymentet.
7. Supabase Dashboard → **Authentication → URL Configuration**:
   - Site URL: a Vercel production URL;
   - Redirect URLs: a production URL és szükség esetén a Vercel preview mintája.

Telepítés után lépj be a Supabase-ben létrehozott felhasználóval. Mobilon a böngésző „Hozzáadás a kezdőképernyőhöz” műveletével az app önálló ablakban indítható.

## Adatmodell

- `settlement_periods`: nyitó/záró mérőállások és az időszak állapota;
- `meter_readings`: időpontozott fogyasztási és termelési mérőállások.

A fogyasztási és termelési különbségek nincsenek redundánsan eltárolva; az alkalmazás mindig az óraállásokból számítja őket.
