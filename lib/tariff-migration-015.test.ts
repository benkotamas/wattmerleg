import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("015 MVM tariff migration", () => {
  const sql = readFileSync("supabase/migrations/015_mvm_tariff_billing.sql", "utf8");
  it("adds the monthly base fee without changing the annual allowance", () => {
    expect(sql).toContain("monthly_base_fee_ft");
    expect(sql).toContain("153.035");
    expect(sql).toContain("36.208");
    expect(sql).toContain("70.104");
    expect(sql).not.toMatch(/discounted_limit_kwh\s*=/i);
  });
});
