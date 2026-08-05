import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ access: "allowed" as "allowed" | "unauthenticated" | "forbidden" | "not_configured", tables: [] as string[], users: [] as string[], data: {} as Record<string, unknown[]>, ranges: [] as Array<[number, number]>, orders: [] as Array<[string, string]> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/growatt/history-route", () => ({ growattHistoryRouteContext: async () => state.access === "allowed" ? { access: "allowed", userId: "session-owner", client: client() } : { access: state.access } }));

function query(table: string) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((_field: string, value: string) => { state.users.push(value); return builder; });
  builder.gte = vi.fn(() => builder); builder.lte = vi.fn(() => builder);
  builder.order = vi.fn((field: string, options?: { ascending?: boolean }) => { state.orders.push([field, options?.ascending === false ? "desc" : "asc"]); return builder; });
  builder.range = vi.fn(async (from: number, to: number) => { state.ranges.push([from, to]); return { data: (state.data[table] ?? []).slice(from, to + 1), error: null }; });
  builder.then = (resolve: (value: unknown) => void) => resolve({ data: state.data[table] ?? [], error: null });
  return builder;
}
function client() { return { from: (table: string) => { state.tables.push(table); return query(table); } }; }
const request = (startMonth: string, endMonth: string) => new NextRequest(`http://localhost/api/solar/consumption-analysis?startMonth=${startMonth}&endMonth=${endMonth}`);

import { GET } from "./route";

describe("GET solar consumption analysis", () => {
  beforeEach(() => { state.access = "allowed"; state.tables = []; state.users = []; state.data = {}; state.ranges = []; state.orders = []; });
  it("session nélkül 401", async () => { state.access = "unauthenticated"; expect((await GET(request("2026-07", "2026-07"))).status).toBe(401); });
  it("érvénytelen és 24 hónapnál hosszabb tartományt elutasít", async () => { expect((await GET(request("bad", "2026-07"))).status).toBe(400); expect((await GET(request("2024-01", "2026-01"))).status).toBe(400); });
  it("jövőbeli hónapot normalizált hibával elutasít", async () => { const response = await GET(request("9999-01", "9999-01")); expect(response.status).toBe(400); await expect(response.json()).resolves.toMatchObject({ error: { code: "FUTURE_MONTH" } }); });
  it("kizárólag a session saját mérő- és Growatt adatait kéri le", async () => { const response = await GET(request("2026-07", "2026-07")); expect(response.status).toBe(200); expect(state.tables).toEqual(["meter_readings", "growatt_daily_energy"]); expect(state.users).toEqual(["session-owner", "session-owner"]); });
  it("hiányos adatot állapotként ad vissza, azonosítót nem szivárogtat", async () => { const response = await GET(request("2026-07", "2026-07")), text = await response.text(); expect(text).toContain("missing_meter_data"); expect(text).not.toMatch(/plantId|deviceId|serialNumber|token|session-owner/); });
  it("includes relevant readings after row 1000 with stable ordering", async () => {
    const filler = Array.from({ length: 1000 }, (_, index) => ({ id: `old-${index}`, user_id: "session-owner", reading_at: new Date(Date.UTC(2020, 0, index + 1)).toISOString(), consumption_meter_kwh: index, production_meter_kwh: 0, note: null, settlement_period_id: "old", created_at: "2020-01-01", updated_at: "2020-01-01" }));
    state.data.meter_readings = [...filler, { id: "july-start", user_id: "session-owner", reading_at: "2026-07-01T00:00:00+02:00", consumption_meter_kwh: 2000, production_meter_kwh: 500, note: null, settlement_period_id: "current", created_at: "2026-07-01", updated_at: "2026-07-01" }, { id: "july-end", user_id: "session-owner", reading_at: "2026-08-01T00:00:00+02:00", consumption_meter_kwh: 2100, production_meter_kwh: 520, note: null, settlement_period_id: "current", created_at: "2026-08-01", updated_at: "2026-08-01" }];
    state.data.growatt_daily_energy = Array.from({ length: 31 }, (_, index) => ({ local_date: `2026-07-${String(index + 1).padStart(2, "0")}`, energy_kwh: 10, quality_status: "complete", plant_timezone: "Europe/Budapest" }));
    const response = await GET(request("2026-07", "2026-07")), body = await response.json();
    expect(response.status).toBe(200); expect(body.months[0]).toMatchObject({ gridImportKwh: 100, gridExportKwh: 20 });
    expect(state.ranges).toEqual([[0, 999], [1000, 1999]]); expect(state.orders.slice(0, 2)).toEqual([["reading_at", "asc"], ["id", "asc"]]);
  });
});
