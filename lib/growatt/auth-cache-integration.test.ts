import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Growatt browser cache auth-integráció", () => {
  it("sikeres login után, navigáció előtt törli a régi cache-t", () => { const source=readFileSync("app/belepes/page.tsx","utf8");expect(source.indexOf("clearGrowattBrowserCache();")).toBeGreaterThan(source.indexOf("signInWithPassword"));expect(source.indexOf("clearGrowattBrowserCache();")).toBeLessThan(source.indexOf('router.replace("/")')); });
  it("logout signOut hiba esetén is, finally-ban és átirányítás előtt törli a cache-t", () => { const source=readFileSync("app/beallitasok/page.tsx","utf8");expect(source).toMatch(/try\s*{[^}]*auth\.signOut\(\);\s*}\s*finally\s*{/);expect(source.indexOf("clearGrowattBrowserCache();")).toBeGreaterThan(source.indexOf("finally"));expect(source.indexOf("clearGrowattBrowserCache();")).toBeLessThan(source.indexOf('router.replace("/belepes")')); });
  it("a kártya a Growatt browser-state helperrel kezeli a storage eseményt",()=>{const source=readFileSync("components/growatt/solar-production-card.tsx","utf8");expect(source).toContain('window.addEventListener("storage", sync)');expect(source).toContain("growattBrowserStateForStorageEvent(event.key)");expect(source).toContain("setData(state.data)");expect(source).toContain("state.rateLimitedUntil");});
});
