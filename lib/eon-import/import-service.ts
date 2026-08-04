import { createHash } from "node:crypto";
import { parseEonWorkbook } from "./parser";
import { EonImportError, type EonImportErrorCode } from "./errors";
import type { EonParseResult } from "./types";

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  findExistingHash?: (userId: string, hash: string) => PromiseLike<{ exists: boolean; failed: boolean }>;
};

export async function importEonWorkbook(args: { userId: string; bytes: Uint8Array | Buffer; source: "eon_portal_export"; externalMessageId?: string; expectedSha256?: string; client: RpcClient; referenceDate?: string }) {
  const calculatedHash = createHash("sha256").update(args.bytes).digest("hex");
  if (args.expectedSha256 && calculatedHash !== args.expectedSha256) throw new EonImportError("EON_PREVIEW_HASH_MISMATCH");
  if (args.client.findExistingHash) {
    const existing = await args.client.findExistingHash(args.userId, calculatedHash);
    if (existing.failed) throw new EonImportError("EON_DATABASE_ERROR", 503);
    if (existing.exists) throw new EonImportError("EON_ALREADY_IMPORTED", 409);
  }
  const parsed = parseEonWorkbook(args.bytes, { referenceDate: args.referenceDate });
  if (parsed.blockingErrors.length) throw new EonImportError(parsed.blockingErrors[0] as EonImportErrorCode);
  const status = parsed.warnings.length ? "completed_with_warnings" : "completed";
  const batch = { attachment_sha256: parsed.sha256, external_message_id: args.externalMessageId ?? null, status, period_start: parsed.periodStart, period_end: parsed.periodEnd, raw_rows: parsed.rawRows, valid_rows: parsed.validRows, invalid_rows: parsed.invalidRows, complete_days: parsed.completeDays, provisional_days: parsed.provisionalDays, incomplete_days: parsed.incompleteDays, warning_codes: parsed.warnings };
  const { data, error } = await args.client.rpc("import_eon_interval_batch", { target_user_id: args.userId, batch, readings: parsed.intervals.map(x => ({ interval_start_utc: x.intervalStartUtc, local_date: x.localDate, import_kwh: x.importKwh, export_kwh: x.exportKwh })) });
  if (error) {
    if (error.message?.includes("EON_ALREADY_IMPORTED")) throw new EonImportError("EON_ALREADY_IMPORTED", 409);
    throw new EonImportError("EON_DATABASE_ERROR", 503);
  }
  const result = data as { batch_id: string; inserted_rows: number; updated_rows: number; unchanged_rows: number };
  return { batchId: result.batch_id, status, insertedRows: result.inserted_rows, updatedRows: result.updated_rows, unchangedRows: result.unchanged_rows, invalidRows: parsed.invalidRows, completeDays: parsed.completeDays, provisionalDays: parsed.provisionalDays, incompleteDays: parsed.incompleteDays, periodStart: parsed.periodStart, periodEnd: parsed.periodEnd, warnings: parsed.warnings };
}
export type { EonParseResult };
