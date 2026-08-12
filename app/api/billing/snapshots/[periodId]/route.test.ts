import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH, POST } from "./route";
import { DEFAULT_TARIFF_SETTINGS } from "@/lib/config";

const PERIOD_ID = "fab20e8d-760d-431e-8e70-bf3617137d3f";
const state = vi.hoisted(() => ({ authenticated: true, clientAvailable: true, existing: null as Record<string, unknown> | null,
  period: { id: "fab20e8d-760d-431e-8e70-bf3617137d3f", start_date: "2025-09-12", opening_reading_at: "2025-09-11T22:00:00Z", end_date: "2026-08-07", opening_consumption_meter_kwh: 94_801, opening_production_meter_kwh: 37_146, closing_consumption_meter_kwh: 110_705, closing_production_meter_kwh: 45_046, status: "closed", created_at: "2025-09-12T00:00:00Z" } as Record<string, unknown> | null,
  tariff: null as Record<string, unknown> | null, inserted: null as Record<string, unknown> | null, updated: null as Record<string, unknown> | null, updateFound: true }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => {
  if (!state.clientAvailable) return null;
  return { auth: { getUser: async () => ({ data: { user: state.authenticated ? { id: "owner" } : null } }) }, from: (table: string) => {
    let operation: "read" | "insert" | "update" = "read", inserted: Record<string, unknown> | null = null, updated: Record<string, unknown> | null = null;
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder); builder.eq = vi.fn(() => builder);
    builder.insert = vi.fn((value: Record<string, unknown>) => { operation = "insert"; inserted = value; state.inserted = value; return builder; });
    builder.update = vi.fn((value: Record<string, unknown>) => { operation = "update"; updated = value; state.updated = value; return builder; });
    builder.maybeSingle = vi.fn(async () => {
      if (table === "settlement_periods") return { data: state.period, error: null };
      if (table === "tariff_settings") return { data: state.tariff, error: null };
      if (operation === "update") return { data: state.updateFound ? { id: "snapshot", settlement_period_id: PERIOD_ID, ...updated } : null, error: null };
      return { data: state.existing, error: null };
    });
    builder.single = vi.fn(async () => ({ data: operation === "insert" ? { id: "snapshot", ...inserted } : state.existing, error: null }));
    return builder;
  } };
} }));

const params = { params: Promise.resolve({ periodId: PERIOD_ID }) };
beforeEach(() => { state.authenticated = true; state.clientAvailable = true; state.existing = null; state.tariff = { ...DEFAULT_TARIFF_SETTINGS }; state.inserted = null; state.updated = null; state.updateFound = true; });

describe("settlement bill snapshot API", () => {
  it("a lezárt hivatalos időszak pontos MVM-pillanatképét létrehozza", async () => {
    const response = (await POST(new Request("http://localhost"), params))!;
    expect(response.status).toBe(201);
    expect(state.inserted).toMatchObject({ user_id: "owner", settlement_period_id: PERIOD_ID, billing_start_date: "2025-09-12", billing_end_date: "2026-08-07", billing_days: 330, discounted_price_ft: 36.208, market_price_ft: 70.104, monthly_base_fee_ft: 153.035 });
    expect(Math.round(Number(state.inserted?.calculated_total_ft))).toBe(485_480);
  });
  it("ismételt kérésre a meglévő pillanatképet adja vissza", async () => {
    state.existing = { id: "existing", settlement_period_id: PERIOD_ID };
    const response = (await POST(new Request("http://localhost"), params))!;
    expect(response.status).toBe(200); expect(state.inserted).toBeNull(); await expect(response.json()).resolves.toEqual({ snapshot: state.existing });
  });
  it("csak bejelentkezve és érvényes időszakazonosítóval használható", async () => {
    state.authenticated = false; expect((await POST(new Request("http://localhost"), params))!.status).toBe(401);
    expect((await POST(new Request("http://localhost"), { params: Promise.resolve({ periodId: "not-a-uuid" }) }))!.status).toBe(400);
  });
  it("csak a hivatalos összeget és számlahivatkozást módosítja", async () => {
    const request = new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ officialTotalFt: 485_480, invoiceReference: " 845803512147 " }) });
    expect((await PATCH(request, params))!.status).toBe(200);
    expect(state.updated).toMatchObject({ official_total_ft: 485_480, invoice_reference: "845803512147" });
    expect(Object.keys(state.updated ?? {}).sort()).toEqual(["invoice_reference", "official_total_ft", "official_updated_at"]);
  });
  it("hibás hivatalos számlaadatot elutasít", async () => {
    const request = new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ officialTotalFt: "485480", invoiceReference: "x".repeat(101) }) });
    expect((await PATCH(request, params))!.status).toBe(400); expect(state.updated).toBeNull();
  });
});
