import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GrowattClient } from "./client";
import { configFingerprint, loadGrowattLatestConfig, loadGrowattStatusConfig } from "./config";
import { growattRouteAccess } from "./auth";
import { cached, clearGrowattCache } from "./service";

afterEach(() => { vi.unstubAllEnvs(); clearGrowattCache(); });
const ok = (body: unknown = { ok: true }) => new Response(JSON.stringify(body), { status: 200 });

describe("rugalmas Growatt transport", () => {
  it("raw token template", async () => { const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => { expect(new Headers(init?.headers).get("X-Token")).toBe("runtime-sensitive"); return ok(); }); await new GrowattClient({ baseUrl: "https://example.test", token: "runtime-sensitive", authHeader: "X-Token", authValueTemplate: "{token}", fetcher }).get("/"); });
  it("Bearer token template", async () => { const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => { expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer runtime-sensitive"); return ok(); }); await new GrowattClient({ baseUrl: "https://example.test", token: "runtime-sensitive", authHeader: "Authorization", authValueTemplate: "Bearer {token}", fetcher }).get("/"); });
  it("GET query paramétert továbbít", async () => { const fetcher = vi.fn(async (input: string | URL) => { expect(new URL(input).searchParams.get("plant")).toBe("p 1"); return ok(); }); await new GrowattClient({ baseUrl: "https://example.test", token: "x", authHeader: "X", authValueTemplate: "{token}", fetcher }).request({ method: "GET", path: "/plants", query: { plant: "p 1" } }); });
  it("általános POST JSON bodyt továbbít", async () => { const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => { expect(init?.method).toBe("POST"); expect(init?.body).toBe(JSON.stringify({ arbitrary: { value: 1 } })); return ok(); }); await new GrowattClient({ baseUrl: "https://example.test", token: "x", authHeader: "X", authValueTemplate: "{token}", fetcher }).request({ method: "POST", path: "/probe", body: { arbitrary: { value: 1 } } }); });
  it("token hiba esetén sem jelenik meg", async () => { const token = "runtime-sensitive"; await new GrowattClient({ baseUrl: "https://example.test", token, authHeader: "Authorization", authValueTemplate: "Bearer {token}", fetcher: async () => new Response("raw", { status: 401 }) }).get("/").catch(error => expect(String(error)).not.toContain(token)); });
});

describe("fokozatos konfiguráció", () => {
  const plantMap = JSON.stringify({ plantList: "payload.plants", plant: { id: "id" } });
  function baseEnv() { vi.stubEnv("GROWATT_API_TOKEN", "runtime-sensitive"); vi.stubEnv("GROWATT_API_BASE_URL", "https://example.test"); vi.stubEnv("GROWATT_API_AUTH_HEADER", "Authorization"); vi.stubEnv("GROWATT_API_AUTH_VALUE_TEMPLATE", "Bearer {token}"); vi.stubEnv("GROWATT_PLANTS_PATH", "/plants"); vi.stubEnv("GROWATT_FIELD_MAP_JSON", plantMap); }
  it("status latest config nélkül is betölthető", () => { baseEnv(); expect(loadGrowattStatusConfig()).toMatchObject({ plant: { plantsPath: "/plants" }, device: undefined }); });
  it("latest hiányos konfiguráció NOT_CONFIGURED", () => { baseEnv(); expect(() => loadGrowattLatestConfig()).toThrow("nincs teljesen konfigurálva"); });
  it("config- és credential-version váltás más cache kulcsot eredményez", async () => { const first = configFingerprint({ baseUrl: "https://a.test", authHeader: "X", credentialVersion: "1", paths: ["/plants"], fieldMaps: [{ id: "a" }] }); const second = configFingerprint({ baseUrl: "https://a.test", authHeader: "X", credentialVersion: "2", paths: ["/plants"], fieldMaps: [{ id: "a" }] }); const loader = vi.fn(async () => 1); await cached(`status:${first}`, 1000, loader); await cached(`status:${second}`, 1000, loader); expect(first).not.toBe(second); expect(loader).toHaveBeenCalledTimes(2); });
});

describe("route tulajdonosi védelem", () => {
  const client = (id: string | null) => async () => ({ auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } });
  it("session nélkül unauthenticated", async () => expect(growattRouteAccess(client(null), "owner")).resolves.toBe("unauthenticated"));
  it("idegen user forbidden", async () => expect(growattRouteAccess(client("other"), "owner")).resolves.toBe("forbidden"));
  it("tulajdonost engedélyez", async () => expect(growattRouteAccess(client("owner"), "owner")).resolves.toBe("allowed"));
  it("hiányzó owner configot nem enged tovább", async () => expect(growattRouteAccess(client("owner"), "")).resolves.toBe("not_configured"));
});
