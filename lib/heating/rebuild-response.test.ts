import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { interpretHeatingRebuildResponse } from "./rebuild-response";

describe("heating rebuild response", () => {
  it("interprets a successful JSON response", async () => {
    await expect(interpretHeatingRebuildResponse(new Response(JSON.stringify({ analyzedDays: 365 }), { status: 200 }))).resolves.toEqual({ success: true, message: "365 nap újraszámítva." });
  });
  it("handles a non-JSON Vercel 504 without throwing", async () => {
    const result = await interpretHeatingRebuildResponse(new Response("An error occurred with your deployment", { status: 504 }));
    expect(result.success).toBe(false); expect(result.message).toContain("túllépte a szerver időkorlátját");
  });
  it("explains an already-running response in Hungarian", async () => {
    const result = await interpretHeatingRebuildResponse(new Response(JSON.stringify({ error: { code: "ANALYSIS_ALREADY_RUNNING" } }), { status: 409 }));
    expect(result.success).toBe(false); expect(result.message).toContain("Már fut egy historikus elemzés"); expect(result.message).toContain("zárolása");
  });
  it("keeps the rebuild on Node.js with a five-minute route budget", () => {
    const route = readFileSync("app/api/heating/analysis/rebuild/route.ts", "utf8");
    expect(route).toContain('export const runtime="nodejs"');
    expect(route).toContain("export const maxDuration=300");
  });
});
