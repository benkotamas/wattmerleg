import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ user: true, eqValues: [] as string[], notCalls: [] as unknown[][] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user ? { id: "owner" } : null } }) }, from: () => { const builder: Record<string, unknown> = {}; for (const method of ["select","gte","lte","order"]) builder[method] = vi.fn(() => builder); builder.eq = vi.fn((_field: string, value: string) => { state.eqValues.push(value); return builder; }); builder.not = vi.fn((...args: unknown[]) => { state.notCalls.push(args); return builder; }); builder.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null }); return builder; } }) }));
import { GET } from "./route";
const get = (query = "") => GET(new NextRequest(`http://localhost/api/solar/monthly-snapshots${query}`));
describe("monthly snapshot GET route", () => {
  beforeEach(() => { state.user = true; state.eqValues = []; state.notCalls = []; });
  it("requires a session and both month parameters", async () => { state.user = false; expect((await get("?startMonth=2026-07&endMonth=2026-07")).status).toBe(401); state.user = true; expect((await get()).status).toBe(400); });
  it("limits query to own, finalized, current algorithm snapshots", async () => { expect((await get("?startMonth=2026-07&endMonth=2026-07")).status).toBe(200); expect(state.eqValues).toContain("owner"); expect(state.eqValues).toContain(1 as unknown as string); expect(state.notCalls).toContainEqual(["finalized_at", "is", null]); });
  it("rejects ranges over 24 months", async () => expect((await get("?startMonth=2024-07&endMonth=2026-07")).status).toBe(400));
});
