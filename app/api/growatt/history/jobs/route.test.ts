import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/growatt/history-route", () => ({ growattHistoryRouteContext: async () => ({ access: "allowed", userId: "owner", client: {} }) }));
import { PATCH, POST } from "./route";

const request = (method: "POST" | "PATCH", body: unknown, raw = false) => new NextRequest("http://localhost/api/growatt/history/jobs", { method, headers: { "content-type": "application/json" }, body: raw ? String(body) : JSON.stringify(body) });
describe("Growatt history jobs body validation", () => {
  it.each([null, [], {}])("POST rejects null/array/incomplete body: %j", async body => expect((await POST(request("POST", body))).status).toBe(400));
  it("POST rejects malformed JSON", async () => expect((await POST(request("POST", "{", true))).status).toBe(400));
  it.each([null, [], {}, { id: "", action: "resume" }, { id: "job", action: "unknown" }])("PATCH rejects invalid body: %j", async body => expect((await PATCH(request("PATCH", body))).status).toBe(400));
  it("PATCH rejects malformed JSON", async () => expect((await PATCH(request("PATCH", "{", true))).status).toBe(400));
});
