import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BillingVerification } from "./billing-verification";
import type { SettlementBillSnapshot } from "@/lib/types";

const snapshot = { id: "snapshot", user_id: "owner", settlement_period_id: "period", billing_start_date: "2025-09-12", billing_end_date: "2026-08-07", opening_consumption_meter_kwh: 94_801, opening_production_meter_kwh: 37_146, closing_consumption_meter_kwh: 110_705, closing_production_meter_kwh: 45_046, consumption_kwh: 15_904, production_kwh: 7_900, balance_kwh: 8_004, billing_days: 330, discounted_quantity_kwh: 2_280.3, discounted_fee_ft: 82_568, market_quantity_kwh: 5_723.7, market_fee_ft: 401_285, base_fee_ft: 1_627, feed_in_credit_ft: 0, calculated_total_ft: 485_479.692, discounted_limit_kwh: 2_523, discounted_price_ft: 36.208, market_price_ft: 70.104, monthly_base_fee_ft: 153.035, feed_in_price_ft: 5, official_total_ft: 485_480, invoice_reference: "845803512147", calculation_version: "mvm-2026-v1", snapshotted_at: "2026-08-12T12:00:00Z", official_updated_at: "2026-08-12T12:05:00Z", created_at: "2026-08-12T12:00:00Z", updated_at: "2026-08-12T12:05:00Z" } satisfies SettlementBillSnapshot;

describe("BillingVerification", () => {
  it("a hivatalos MVM összeget és a pontos egyezést kiemeli", () => {
    const html = renderToStaticMarkup(<BillingVerification periodId="period" snapshot={snapshot} currentCalculatedAmount={485_479.692} available/>);
    expect(html).toContain("pontos egyezés"); expect(html).toContain("MVM végösszeg"); expect(html).toContain("485 480 Ft"); expect(html).toContain("A rögzített mérő-, tarifa- és díjadatok nem írhatók át.");
  });
  it("pillanatkép nélkül rögzítési műveletet kínál", () => {
    const html = renderToStaticMarkup(<BillingVerification periodId="period" snapshot={null} currentCalculatedAmount={1} available/>);
    expect(html).toContain("Díjszámítás rögzítése"); expect(html).toContain("későbbi tarifamódosításkor sem változik meg");
  });
  it("migráció nélkül egyértelmű teendőt mutat", () => expect(renderToStaticMarkup(<BillingVerification periodId="period" snapshot={null} currentCalculatedAmount={1} available={false}/>)).toContain("016_settlement_bill_snapshots.sql"));
});
