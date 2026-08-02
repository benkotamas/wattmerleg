import { NextResponse } from "next/server";
import { growattTokenConfigured } from "@/lib/growatt/config";
import { growattRouteAccess } from "@/lib/growatt/auth";
import { growattErrorResponse } from "@/lib/growatt/route";
import { cached, connectionStatus, defaultGrowattStatusProvider } from "@/lib/growatt/service";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const access = await growattRouteAccess();
  if (access === "unauthenticated") return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Bejelentkezés szükséges." } }, { status: 401, headers: noStore });
  if (access === "forbidden") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Ehhez a Growatt-fiókhoz nincs hozzáférésed." } }, { status: 403, headers: noStore });
  if (access === "not_configured") return NextResponse.json({ error: { code: "GROWATT_NOT_CONFIGURED", message: "A Growatt tulajdonosa nincs konfigurálva." } }, { status: 503, headers: noStore });
  if (!growattTokenConfigured()) return NextResponse.json({ configured: false, connected: false, checkedAt: new Date().toISOString(), message: "A Growatt integráció nincs konfigurálva." }, { headers: { "Cache-Control": "private, max-age=300" } });
  try {
    const { provider, fingerprint } = defaultGrowattStatusProvider();
    return NextResponse.json(await cached(`growatt:status:${fingerprint}`, 300_000, () => connectionStatus(provider)), { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) { return growattErrorResponse(error); }
}
