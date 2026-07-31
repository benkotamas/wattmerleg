import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfidenceExplanation } from "./confidence-explanation";

describe("ConfidenceExplanation", () => {
  it.each([
    ["low", "Alacsony"],
    ["medium", "Közepes"],
    ["high", "Magas"],
  ] as const)("a %s szint magyar címkével jelenik meg", (level, label) => {
    expect(renderToStaticMarkup(<ConfidenceExplanation level={level}/>)).toContain(`${label} megbízhatóság`);
  });

  it("compact módban natív, tappolható és billentyűzettel elérhető disclosure-t használ", () => {
    const html = renderToStaticMarkup(<ConfidenceExplanation level="medium" compact/>);
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("Mit jelent? ⓘ");
    expect(html).toContain("nem százalékos pontosságot jelent");
    expect(html).not.toContain("title=");
  });
});
