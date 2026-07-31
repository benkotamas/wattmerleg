export type ConfidenceLevel = "low" | "medium" | "high";

const presentations = {
  low: {
    label: "Alacsony",
    explanation: "Kevés vagy bizonytalan adat alapján készült becslés.",
  },
  medium: {
    label: "Közepes",
    explanation: "Van használható történeti adat, de a minta még korlátozott.",
  },
  high: {
    label: "Magas",
    explanation: "Több, egymással összhangban lévő jó minőségű minta támasztja alá.",
  },
} as const;

export const confidencePresentation = (level: ConfidenceLevel) => presentations[level];

export function retrospectiveConfidenceReasons(input: {
  durationDays: number;
  weatherDayCount: number;
  weatherCoverageRatio?: number;
  baselineSampleCount: number;
  dataWarning?: string | null;
  productionDeltaKwh?: number | null;
  observedGridImportKwh: number;
}) {
  const reasons = [
    `${input.baselineSampleCount} historikus intervallum szolgált az alapterhelés becsléséhez.`,
    `A mérési intervallum hossza ${input.durationDays.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} nap.`,
    ...(input.weatherCoverageRatio == null
      ? [`Érintett helyi napok: ${input.weatherDayCount}.`]
      : [`Időjárási lefedettség: ${(input.weatherCoverageRatio * 100).toFixed(0)}%.`, `Érintett helyi napok: ${input.weatherDayCount}.`]),
  ];
  if (input.dataWarning) reasons.push(`Adatminőségi figyelmeztetés: ${input.dataWarning}`);
  if (input.productionDeltaKwh != null && input.productionDeltaKwh > input.observedGridImportKwh) {
    reasons.push("A jelentős PV/termelési aktivitás növeli a retrospektív becslés bizonytalanságát.");
  }
  reasons.push("Az akkori tényleges kazánbeállítás és komfort nem ismert.");
  return reasons;
}

export function actualHeatingConfidenceReasons(input: {
  similarLogCount: number;
  hasReference: boolean;
  confidence: ConfidenceLevel;
}) {
  const reasons = [
    `${input.similarLogCount} hasonló, megfelelő komfortú tényleges fűtési megfigyelés áll rendelkezésre.`,
  ];
  reasons.push(input.hasReference
    ? "Van a jelenlegi teljesítménykorláton belüli, ténylegesen kipróbált referenciabeállítás."
    : "Nincs biztonságosan használható, ténylegesen kipróbált referenciabeállítás.");
  if (input.confidence === "high" && input.similarLogCount >= 3 && input.hasReference) {
    reasons.push("Legalább 3 megfelelő komfortú megfigyelés alapján a komforteredmények és az előremenő értékek kellően konzisztensek.");
  }
  return reasons;
}

export function noHeatingDemandConfidence(input: { outdoorC: number; targetIndoorC: number }) {
  const difference = input.outdoorC - input.targetIndoorC;
  return {
    explanation: "A külső napi átlag eléri vagy meghaladja a beállított beltéri célhőmérsékletet, ezért az épületnek ezen feltétel alapján nincs fűtési hőigénye.",
    reasons: [
      `Külső napi átlag: ${input.outdoorC.toLocaleString("hu-HU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C.`,
      `Beltéri cél: ${input.targetIndoorC.toLocaleString("hu-HU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C.`,
      `A külső átlag ${difference.toLocaleString("hu-HU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C-kal magasabb a beltéri célnál.`,
      "Ehhez a megállapításhoz nincs szükség korábbi fűtési megfigyelésre.",
    ],
  };
}
