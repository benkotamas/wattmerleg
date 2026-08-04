import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ access: "allowed", parse: vi.fn(), commit: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: vi.fn(), from: vi.fn() }) }));
vi.mock("@/lib/eon-import/route-auth", () => ({
  eonImportContext: async () => state.access === "allowed"
    ? { access: "allowed", userId: "owner", client: { rpc: vi.fn(), from: state.from } }
    : { access: state.access },
}));
vi.mock("@/lib/eon-import/parser", () => ({ EON_MAX_FILE_BYTES: 10 * 1024 * 1024, parseEonWorkbook: (bytes: Uint8Array) => state.parse(bytes) }));
vi.mock("@/lib/eon-import/import-service", () => ({ importEonWorkbook: (args: unknown) => state.commit(args) }));
import { POST as previewPOST } from "./preview/route";
import { POST as commitPOST } from "./commit/route";
import { GET as importsGET } from "../imports/route";

const parsed = { sha256: "a".repeat(64), periodStart: "2026-08-01", periodEnd: "2026-08-02", rawRows: 2, validRows: 2, invalidRows: 0, completeDays: 1, provisionalDays: 1, incompleteDays: 0, importSumKwh: 1, exportSumKwh: 2, summaryValidation: { totalMatches: true, maximumMatches: true }, days: [], intervals: [{ secret: "raw" }], blockingErrors: [], warnings: [] };
function upload(fields: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([0x50, 0x4b, 1, 2])], "safe.xlsx"));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest("http://localhost/api/eon/import", { method: "POST", body: form });
}

describe("E.ON import routes", () => {
  beforeEach(() => {
    state.access = "allowed";
    state.parse.mockReset().mockReturnValue(parsed);
    state.commit.mockReset().mockResolvedValue({ batchId: "batch", status: "completed", insertedRows: 2, updatedRows: 0, unchangedRows: 0, warnings: [] });
    state.from.mockReset();
  });
  it("session nélkül 401, idegen user 403", async () => {
    state.access = "unauthorized"; expect((await previewPOST(upload())).status).toBe(401);
    state.access = "forbidden"; expect((await previewPOST(upload())).status).toBe(403);
  });
  it("rossz multipart és fájltípus kontrollált 400/415", async () => {
    expect((await previewPOST(new NextRequest("http://localhost", { method: "POST", body: "x" }))).status).toBe(400);
    const form = new FormData(); form.set("file", new File(["x"], "x.txt"));
    expect((await previewPOST(new NextRequest("http://localhost", { method: "POST", body: form }))).status).toBe(415);
  });
  it("preview nem ír adatbázist és nem ad nyers pontot vagy fájlnevet", async () => {
    const response = await previewPOST(upload()), body = await response.json(), text = JSON.stringify(body);
    expect(response.status).toBe(200); expect(state.from).not.toHaveBeenCalled(); expect(body).not.toHaveProperty("intervals");
    expect(text).not.toContain('"secret"'); expect(text).not.toContain("safe.xlsx");
  });
  it("commit újraparsoló service-t hív a hash-sel", async () => {
    expect((await commitPOST(upload({ expectedSha256: "a".repeat(64) }))).status).toBe(200);
    expect(state.commit).toHaveBeenCalledWith(expect.objectContaining({ expectedSha256: "a".repeat(64), source: "eon_portal_export" }));
  });
  it("hibás preview hash mellett nincs commit", async () => {
    expect((await commitPOST(upload({ expectedSha256: "bad" }))).status).toBe(400); expect(state.commit).not.toHaveBeenCalled();
  });
  it("előzmény csak allowlistelt saját batch mezőket kér", async () => {
    const value = { data: [{ id: "b", period_start: "2026-08-01" }], error: null };
    type Chain = PromiseLike<typeof value> & { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn> };
    const chain = { then: (resolve: (input: typeof value) => unknown) => Promise.resolve(resolve(value)) } as unknown as Chain;
    for (const name of ["select", "eq", "order", "limit"] as const) chain[name] = vi.fn(() => chain);
    state.from.mockReturnValue(chain);
    const text = await (await importsGET()).text();
    expect(chain.eq).toHaveBeenCalledWith("user_id", "owner"); expect(text).not.toContain("attachment_sha256"); expect(text).not.toContain("external_message_id");
  });
});
