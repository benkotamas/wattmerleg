import "server-only";
import { GrowattError, asGrowattError } from "./errors";
import { GrowattOpenApiV1, GROWATT_V1_BASE_URL, mapV1Plants } from "./openapi-v1";
import { validGrowattTimezone } from "./time";
import { localIsoDate } from "@/lib/weather/date";
import { chunkGrowattDateRange, dailyDatabaseRow, mapGrowattDailyEnergy, validateGrowattDateRange } from "./historical";

type HistoricalApi = Pick<GrowattOpenApiV1, "plantList" | "plantEnergyHistory">;
export type HistoricalDatabase = { from: (table: string) => { upsert: (rows: unknown[], options: { onConflict: string }) => PromiseLike<{ error: { message?: string } | null }> } };
export type SyncChunkFailure = { startDate: string; endDate: string; code: string };
export type GrowattSyncResult = { ok: boolean; partial: boolean; startDate: string; endDate: string; requestedDays: number; receivedValidDays: number; upsertedDays: number; missingDays: number; invalidRecords: number; duplicateRecords: number; receivedDays: number; insertedOrUpdatedDays: number; chunks: number; successfulChunks: number; failedChunks: SyncChunkFailure[]; retryRanges: { startDate: string; endDate: string }[]; completedAt: string };

function single<T>(rows: T[]): T { if (!rows.length) throw new GrowattError("GROWATT_NO_PLANT", 404); if (rows.length !== 1) throw new GrowattError("GROWATT_UNSUPPORTED_DEVICE", 409); return rows[0]; }
export function defaultHistoricalApi(): HistoricalApi { const token = process.env.GROWATT_API_TOKEN?.trim(); if (!token) throw new GrowattError("GROWATT_NOT_CONFIGURED", 503); return new GrowattOpenApiV1(token, { baseUrl: process.env.GROWATT_API_BASE_URL?.trim() || GROWATT_V1_BASE_URL }); }

export async function syncGrowattHistory(options: { userId: string; startDate: string; endDate: string; database: HistoricalDatabase; api?: HistoricalApi; now?: Date }): Promise<GrowattSyncResult> {
  const api = options.api ?? defaultHistoricalApi(), now = options.now ?? new Date(), receivedDates = new Set<string>(), upsertedDates = new Set<string>(), failures: SyncChunkFailure[] = [];
  validateGrowattDateRange(options.startDate, options.endDate, "9999-12-31");
  const plant = single(mapV1Plants(await api.plantList())), timezone = validGrowattTimezone(plant.timezone), currentLocalDate = localIsoDate(now, timezone);
  const requestedDays = validateGrowattDateRange(options.startDate, options.endDate, currentLocalDate), chunks = chunkGrowattDateRange(options.startDate, options.endDate); let invalidRecords = 0, duplicateRecords = 0, successfulChunks = 0;
  for (const chunk of chunks) {
    try {
      const raw = await api.plantEnergyHistory(plant.id, chunk.startDate, chunk.endDate, "day", 1, 20), fetchedAt = new Date().toISOString();
      const mapped = mapGrowattDailyEnergy(raw, { timezone, currentLocalDate, fetchedAt }); invalidRecords += mapped.invalidRecords; duplicateRecords += mapped.duplicateRecords;
      const rows = mapped.rows.filter(row => row.localDate >= chunk.startDate && row.localDate <= chunk.endDate).map(row => dailyDatabaseRow(row, options.userId));
      rows.forEach(row => receivedDates.add(row.local_date));
      if (rows.length) { const { error } = await options.database.from("growatt_daily_energy").upsert(rows, { onConflict: "user_id,local_date" }); if (error) throw new GrowattError("HISTORY_DATABASE_WRITE_FAILED", 503); }
      rows.forEach(row => upsertedDates.add(row.local_date)); successfulChunks++;
    } catch (error) { failures.push({ startDate: chunk.startDate, endDate: chunk.endDate, code: asGrowattError(error).code }); }
  }
  if (!successfulChunks && failures.length) throw new GrowattError(failures[0].code as ConstructorParameters<typeof GrowattError>[0], failures[0].code === "GROWATT_RATE_LIMITED" ? 429 : 503);
  const receivedValidDays = receivedDates.size, upsertedDays = upsertedDates.size;
  return { ok: failures.length === 0, partial: failures.length > 0, startDate: options.startDate, endDate: options.endDate, requestedDays, receivedValidDays, upsertedDays, missingDays: Math.max(0, requestedDays - receivedValidDays), invalidRecords, duplicateRecords, receivedDays: receivedValidDays, insertedOrUpdatedDays: upsertedDays, chunks: chunks.length, successfulChunks, failedChunks: failures, retryRanges: failures.map(({ startDate, endDate }) => ({ startDate, endDate })), completedAt: new Date().toISOString() };
}

const running = new Set<string>();
export async function withGrowattSyncLock<T>(userId: string, operation: () => Promise<T>): Promise<T> { if (running.has(userId)) throw new Error("SYNC_ALREADY_RUNNING"); running.add(userId); try { return await operation(); } finally { running.delete(userId); } }
