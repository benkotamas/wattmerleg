import { NextResponse } from "next/server";
import { growattRouteAccess } from "@/lib/growatt/auth";
import { growattErrorResponse } from "@/lib/growatt/route";
import { defaultGrowattLatestProvider } from "@/lib/growatt/service";
import { growattLatestCached } from "@/lib/growatt/latest-cache";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET() {
  const access = await growattRouteAccess();
  if (access === "unauthenticated") return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Bejelentkezés szükséges." } }, { status: 401, headers: noStore });
  if (access === "forbidden") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Ehhez a Growatt-fiókhoz nincs hozzáférésed." } }, { status: 403, headers: noStore });
  if (access === "not_configured") return NextResponse.json({ error: { code: "GROWATT_NOT_CONFIGURED", message: "A Growatt tulajdonosa nincs konfigurálva." } }, { status: 503, headers: noStore });
  try {
    const { fingerprint } = defaultGrowattLatestProvider();
    const result = await growattLatestCached(fingerprint);
    if (result.kind === "success") return NextResponse.json(result.data, { headers: noStore });
    const retryAfter = Math.max(1, Math.ceil((result.retryAt - Date.now()) / 1000));
    const headers = { ...noStore, "Retry-After": String(retryAfter) };
    if (result.stale) return NextResponse.json({ ...result.stale, rateLimited: true, retryAt: result.retryAt }, { headers });
    return NextResponse.json({ error: { code: "GROWATT_RATE_LIMITED", message: "A Growatt ideiglenesen korlátozta a lekéréseket." }, retryAt: result.retryAt }, { status: 429, headers });
  } catch (error) { const response = growattErrorResponse(error); response.headers.set("Cache-Control", noStore["Cache-Control"]); return response; }
}
