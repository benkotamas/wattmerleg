import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ access: "allowed" as "allowed" | "unauthorized" | "forbidden", from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/eon-import/route-auth", () => ({ eonImportContext: async () => state.access === "allowed" ? { access: "allowed", userId: "owner", client: { from: state.from, rpc: state.rpc } } : { access: state.access } }));
import { GET } from "./route";

const eonOverview = { periodId: "period-1", periodStartAt: "2026-08-04T14:00:00Z", boundaryPrecision: "exact", gridImportKwh: 100, gridExportKwh: 20, netGridKwh: 80, availableIntervals: 96, expectedClosedDayIntervals: 96, missingClosedDayIntervals: 0, closedDayCoveragePercent: 100, completeDays: 1, provisionalDays: 0, incompleteDays: 0, fallDstLimitedDays: 0, lastDataAt: "2026-08-05T12:00:00Z", stale: false, warnings: [], incompleteDates: [], user_id: "must-not-leak" };
const tariff = { discounted_limit_kwh: 2523, discounted_price_ft: 36.208, market_price_ft: 70.104, monthly_base_fee_ft: 153.035, feed_in_price_ft: 5, annual_closing_month: 8, annual_closing_day: 4, heating_season_start_month: 10, heating_season_start_day: 1, heating_season_end_month: 4, heating_season_end_day: 30 };

function query(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["select", "eq", "order", "limit"]) chain[name] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => result);
  return chain;
}

describe("GET /api/energy/current-position", () => {
  let periodQuery: ReturnType<typeof query>, tariffQuery: ReturnType<typeof query>;
  beforeEach(() => {
    state.access = "allowed"; state.from.mockReset(); state.rpc.mockReset();
    periodQuery = query({ data: { id: "period-1" }, error: null });
    tariffQuery = query({ data: tariff, error: null });
    state.from.mockImplementation((table: string) => table === "settlement_periods" ? periodQuery : tariffQuery);
    state.rpc.mockResolvedValue({ data: eonOverview, error: null });
  });
  it.each([["unauthorized", 401], ["forbidden", 403]] as const)("%s esetén %s és no-store", async (access, status) => {
    state.access = access; const response = await GET(); expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("explicit owner filterrel biztonságos DTO-t ad", async () => {
    const response = await GET(), body = await response.json();
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(periodQuery.eq).toHaveBeenCalledWith("user_id", "owner"); expect(tariffQuery.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(body.position).toMatchObject({ source: "eon_intervals", gridImportKwh: 100, gridExportKwh: 20, tariffSource: "database" });
    expect(JSON.stringify(body)).not.toContain("must-not-leak");
    expect(state.from.mock.calls.map(([table]) => table)).not.toEqual(expect.arrayContaining(["meter_readings", "growatt_daily_energy"]));
  });
  it("tarifahibánál dokumentált fallbacket használ", async () => {
    tariffQuery.maybeSingle.mockResolvedValue({ data: null, error: { message: "hidden" } });
    const body = await (await GET()).json(); expect(body.position.tariffSource).toBe("fallback"); expect(body.position.warnings).toContain("FALLBACK_TARIFF");
  });
  it("nyitott időszak vagy E.ON-adat hiányában null", async () => {
    periodQuery.maybeSingle.mockResolvedValue({ data: null, error: null }); expect(await (await GET()).json()).toEqual({ position: null });
    periodQuery.maybeSingle.mockResolvedValue({ data: { id: "period-1" }, error: null }); state.rpc.mockResolvedValue({ data: null, error: null }); expect(await (await GET()).json()).toEqual({ position: null });
  });
  it.each([
    ["hiányzó mező", { gridImportKwh: undefined }],
    ["null mező", { gridImportKwh: null }],
    ["NaN", { gridImportKwh: Number.NaN }],
    ["Infinity", { gridExportKwh: Number.POSITIVE_INFINITY }],
    ["negatív érték", { gridImportKwh: -1 }],
    ["hibás coverage", { closedDayCoveragePercent: 101 }],
    ["hibás cutoff", { lastDataAt: "invalid" }],
  ])("hibás overview esetén 503 CURRENT_POSITION_UNAVAILABLE: %s", async (_name, patch) => {
    state.rpc.mockResolvedValue({ data: { ...eonOverview, ...patch }, error: null });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "CURRENT_POSITION_UNAVAILABLE" } });
  });
});
