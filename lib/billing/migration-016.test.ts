import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/016_settlement_bill_snapshots.sql", "utf8");

describe("016 settlement bill snapshot migration", () => {
  it("külön, időszakonként egy pillanatképet készít RLS-védelemmel", () => {
    expect(sql).toContain("create table public.settlement_bill_snapshots");
    expect(sql).toMatch(/unique\s*\(user_id, settlement_period_id\)/);
    expect(sql).toContain("alter table public.settlement_bill_snapshots enable row level security");
    expect(sql).toContain("period.status = 'closed'");
    expect(sql).not.toMatch(/policy[\s\S]{0,100}for delete/i);
  });

  it("csak a hivatalos számlamezők módosítását engedi a befagyasztás után", () => {
    expect(sql).toContain("protect_settlement_bill_snapshot_calculation");
    for (const field of ["official_total_ft", "invoice_reference", "official_updated_at", "updated_at"]) expect(sql).toContain(`- '${field}'`);
    expect(sql).toContain("BILLING_SNAPSHOT_IMMUTABLE");
  });

  it("eltárolja a mérő-, tarifa- és tételes díjadatokat", () => {
    for (const field of ["opening_consumption_meter_kwh", "closing_production_meter_kwh", "discounted_quantity_kwh", "market_fee_ft", "monthly_base_fee_ft", "calculated_total_ft", "calculation_version"]) expect(sql).toContain(field);
  });
});
