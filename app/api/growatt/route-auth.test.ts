import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ access: "unauthenticated" as "unauthenticated" | "forbidden" | "not_configured" | "allowed" }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/growatt/auth", () => ({ growattRouteAccess: async () => auth.access }));
vi.mock("@/lib/growatt/config", async (original) => ({ ...(await original<Record<string, unknown>>()), growattTokenConfigured: () => false }));
import { GET as statusGet } from "./status/route";
import { GET as latestGet } from "./latest/route";

describe("Growatt route tulajdonosi védelem", () => {
  beforeEach(() => { auth.access = "unauthenticated"; });
  it.each([["status", statusGet], ["latest", latestGet]] as const)("%s session nélkül 401 JSON", async (_name, handler) => { const response = await handler(); expect(response.status).toBe(401); await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } }); });
  it.each([["status", statusGet], ["latest", latestGet]] as const)("%s idegen usernek 403 JSON", async (_name, handler) => { auth.access = "forbidden"; const response = await handler(); expect(response.status).toBe(403); await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } }); });
  it.each([["status", statusGet], ["latest", latestGet]] as const)("%s hiányzó owner configgal 503 JSON", async (_name, handler) => { auth.access = "not_configured"; const response = await handler(); expect(response.status).toBe(503); await expect(response.json()).resolves.toMatchObject({ error: { code: "GROWATT_NOT_CONFIGURED" } }); });
  it("a tulajdonost továbbengedi", async () => { auth.access = "allowed"; const response = await statusGet(); expect(response.status).toBe(200); await expect(response.json()).resolves.toMatchObject({ configured: false }); });
});
