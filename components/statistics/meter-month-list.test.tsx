import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeterMonthList } from "./meter-month-list";
import type { MonthlyStat } from "@/lib/statistics";

const month = (value: string): MonthlyStat => ({ month: value, label: value, shortLabel: value, consumption: 100, production: 40, balance: 60, estimated: false, hasDataWarning: false, ignoredConsumptionIntervals: 0, ignoredProductionIntervals: 0, coverageStartAt: `${value}-01T00:00:00Z`, coverageEndAt: `${value}-28T00:00:00Z`, coverageStartLocalDate: `${value}-01`, coverageEndLocalDate: `${value}-28`, coversCalendarMonthStart: true, coversRequiredPeriodEnd: true, fullCalendarMonthCoverage: true, sourceIntervalCount: 1 });
describe("tömör villanyórás havi lista", () => { it("minden hónapot tömör, alapból csukott teljes szélességű gombként mutat", () => { const html = renderToStaticMarkup(<MeterMonthList months={[month("2026-06"), month("2026-07")]}/>); expect(html.match(/aria-expanded="false"/g)).toHaveLength(2); expect(html).toContain("w-full"); expect(html).toContain("Vételezés"); expect(html).not.toContain("Forrásintervallumok:"); }); });
