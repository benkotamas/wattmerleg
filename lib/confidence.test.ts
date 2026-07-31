import { describe, expect, it } from "vitest";
import { actualHeatingConfidenceReasons, confidencePresentation, noHeatingDemandConfidence, retrospectiveConfidenceReasons } from "./confidence";

describe("confidence magyarázat", () => {
  it("minden szinthez magyar címkét és magyarázatot ad", () => {
    expect(confidencePresentation("low").label).toBe("Alacsony");
    expect(confidencePresentation("medium").explanation).toContain("korlátozott");
    expect(confidencePresentation("high").label).toBe("Magas");
  });

  it("a retrospektív indokok tartalmazzák a minőségi tényezőket", () => {
    const reasons = retrospectiveConfidenceReasons({ durationDays: 10, weatherDayCount: 10, baselineSampleCount: 4, dataWarning: "hibás delta", productionDeltaKwh: 20, observedGridImportKwh: 10 });
    expect(reasons.join(" ")).toContain("4 historikus");
    expect(reasons.join(" ")).toContain("Adatminőségi");
    expect(reasons.join(" ")).toContain("PV");
    expect(reasons.join(" ")).toContain("komfort nem ismert");
  });

  it("az actual indok tényleges megfigyelésszámot közöl", () => {
    expect(actualHeatingConfidenceReasons({ similarLogCount: 3, hasReference: true, confidence: "high" }).join(" ")).toContain("3 hasonló");
  });

  it("noHeatingDemand külön, logfüggetlen magyarázatot kap", () => {
    const result = noHeatingDemandConfidence({ outdoorC: 31.6, targetIndoorC: 21 });
    expect(result.explanation).toContain("nincs fűtési hőigénye");
    expect(result.reasons.join(" ")).toContain("10,6 °C-kal");
    expect(result.reasons.join(" ")).toContain("nincs szükség korábbi fűtési megfigyelésre");
    expect(result.reasons.join(" ")).not.toContain("konzisztensek");
  });

  it("actual high csak elegendő log és referencia mellett állít konzisztenciát", () => {
    expect(actualHeatingConfidenceReasons({ similarLogCount: 0, hasReference: false, confidence: "high" }).join(" ")).not.toContain("konzisztensek");
    expect(actualHeatingConfidenceReasons({ similarLogCount: 2, hasReference: true, confidence: "high" }).join(" ")).not.toContain("konzisztensek");
    expect(actualHeatingConfidenceReasons({ similarLogCount: 3, hasReference: true, confidence: "high" }).join(" ")).toContain("konzisztensek");
  });
});
