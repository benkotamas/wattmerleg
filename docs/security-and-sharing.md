# Biztonság és megosztás

## Growatt hozzáférés

A Growatt route-ok csak a szerveroldali `GROWATT_ALLOWED_USER_ID` értékével megegyező, hitelesített Supabase-felhasználót engedik tovább. Session nélkül `401`, más felhasználónál `403`, hiányzó tulajdonos-konfigurációnál biztonságos `503 GROWATT_NOT_CONFIGURED` válasz érkezik.

A `GROWATT_CREDENTIAL_VERSION` növelése tokenváltáskor invalidálja a process-memory cache-t. Maga a token és a megengedett felhasználó azonosítója nem része a cache fingerprintnek, és egyik változó sem lehet kliensoldali environment variable.

## Biztonságos ZIP megosztás

A megosztott ZIP-ből ki kell hagyni:

- `.git`
- `.next`
- `node_modules`
- `.env`
- `.env.local`
- `.vercel`
- `*.tsbuildinfo`
- `*.zip`
