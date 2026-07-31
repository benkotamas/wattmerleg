# Wattmérleg

Mobil-first Next.js alkalmazás az otthoni áramfogyasztás és napelemes visszatáplálás nyilvántartására. A felület magyar nyelvű, Supabase-belépéssel védett, Vercelre telepíthető és PWA-ként hozzáadható a kezdőképernyőhöz.

## Funkciók

- aktuális elszámolási időszak fogyasztása, termelése, egyenlege és becsült díja;
- napi átlagok és éves előrejelzés;
- mobilos mérőállás-rögzítés, növekvő óraállás- és dátumellenőrzéssel;
- mérési előzmények szerkesztése és törlése;
- időarányosan becsült havi statisztika és grafikon;
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

A Supabase Dashboard **SQL Editor** felületén sorrendben futtasd le a `supabase/migrations` mappában lévő migrációkat. Az első létrehozza a táblákat, indexeket, RLS-szabályokat és az éves zárás függvényét; a második az újrafuttatható Excel-importhoz szükséges egyedi kulcsot adja hozzá.

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

Megjegyzés: a projekt létrehozásakor a specifikációban említett Excel-fájl nem volt jelen a munkatérben, ezért valódi alapadat-import nem futott le.

## 6. Ellenőrzések

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Az energiaárak és az éves limit egy helyen, a `lib/config.ts` fájlban találhatók.

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
