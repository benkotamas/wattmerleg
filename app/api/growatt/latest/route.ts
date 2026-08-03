import { NextResponse } from "next/server";
import { growattRouteAccess } from "@/lib/growatt/auth";
import { growattErrorResponse } from "@/lib/growatt/route";
import { cached, defaultGrowattLatestProvider, latestEnergy, publicGrowattLatest } from "@/lib/growatt/service";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const access = await growattRouteAccess();
  if (access === "unauthenticated") return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Bejelentkezés szükséges." } }, { status: 401, headers: noStore });
  if (access === "forbidden") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Ehhez a Growatt-fiókhoz nincs hozzáférésed." } }, { status: 403, headers: noStore });
  if (access === "not_configured") return NextResponse.json({ error: { code: "GROWATT_NOT_CONFIGURED", message: "A Growatt tulajdonosa nincs konfigurálva." } }, { status: 503, headers: noStore });
  try {
    const { provider, fingerprint } = defaultGrowattLatestProvider();
    const latest = await cached(`growatt:latest:${fingerprint}`, 120_000, () => latestEnergy(provider));
    return NextResponse.json(publicGrowattLatest(latest), { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (error) { return growattErrorResponse(error); }
}
