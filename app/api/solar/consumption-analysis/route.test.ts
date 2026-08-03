import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ access: "allowed" as "allowed" | "unauthenticated" | "forbidden" | "not_configured", tables: [] as string[], users: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/growatt/history-route", () => ({ growattHistoryRouteContext: async () => state.access === "allowed" ? { access: "allowed", userId: "session-owner", client: client() } : { access: state.access } }));

function query(table: string) {
  const result = table === "meter_readings" ? { data: [], error: null } : { data: [], error: null };
  const builder = { select: vi.fn(() => builder), eq: vi.fn((_field: string, value: string) => { state.users.push(value); return builder; }), gte: vi.fn(() => builder), lte: vi.fn(() => builder), order: vi.fn(async () => result) };
  return builder;
}
function client() { return { from: (table: string) => { state.tables.push(table); return query(table); } }; }
const request = (startMonth: string, endMonth: string) => new NextRequest(`http://localhost/api/solar/consumption-analysis?startMonth=${startMonth}&endMonth=${endMonth}`);

import { GET } from "./route";

describe("GET solar consumption analysis", () => {
  beforeEach(() => { state.access = "allowed"; state.tables = []; state.users = []; });
  it("session nélkül 401", async () => { state.access = "unauthenticated"; expect((await GET(request("2026-07", "2026-07"))).status).toBe(401); });
  it("érvénytelen és 24 hónapnál hosszabb tartományt elutasít", async () => { expect((await GET(request("bad", "2026-07"))).status).toBe(400); expect((await GET(request("2024-01", "2026-01"))).status).toBe(400); });
  it("jövőbeli hónapot normalizált hibával elutasít", async () => { const response = await GET(request("9999-01", "9999-01")); expect(response.status).toBe(400); await expect(response.json()).resolves.toMatchObject({ error: { code: "FUTURE_MONTH" } }); });
  it("kizárólag a session saját mérő- és Growatt adatait kéri le", async () => { const response = await GET(request("2026-07", "2026-07")); expect(response.status).toBe(200); expect(state.tables).toEqual(["meter_readings", "growatt_daily_energy"]); expect(state.users).toEqual(["session-owner", "session-owner"]); });
  it("hiányos adatot állapotként ad vissza, azonosítót nem szivárogtat", async () => { const response = await GET(request("2026-07", "2026-07")), text = await response.text(); expect(text).toContain("missing_meter_data"); expect(text).not.toMatch(/plantId|deviceId|serialNumber|token|session-owner/); });
});
