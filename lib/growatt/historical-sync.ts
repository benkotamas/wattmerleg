import "server-only";
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { GrowattError, asGrowattError } from "./errors";
import { GrowattOpenApiV1, GROWATT_V1_BASE_URL, mapV1Plants } from "./openapi-v1";
import { validGrowattTimezone } from "./time";
import { localIsoDate } from "@/lib/weather/date";
import { chunkGrowattDateRange, dailyDatabaseRow, mapGrowattDailyEnergy, missingGrowattDateRanges, validateGrowattDateRange } from "./historical";

type HistoricalApi = Pick<GrowattOpenApiV1, "plantList" | "plantEnergyHistory">;
type ResolvedPlant = ReturnType<typeof mapV1Plants>[number];
export type HistoricalCoverageRecord = { localDate: string; qualityStatus: "complete" | "provisional" | "missing" | "invalid"; plantTimezone: string | null };
export type HistoricalDatabase = { existingCoverage: (userId: string, startDate: string, endDate: string) => Promise<HistoricalCoverageRecord[]>; upsert: (rows: unknown[]) => PromiseLike<{ error: { message?: string } | null }> };
export type SyncChunkFailure = { startDate: string; endDate: string; code: string };
export type GrowattSyncResult = { ok: boolean; partial: boolean; startDate: string; endDate: string; requestedDays: number; alreadyStoredDays: number; alreadyCompleteDays: number; refreshedProvisionalDays: number; requestedFromGrowattDays: number; receivedValidDays: number; upsertedDays: number; missingDays: number; invalidRecords: number; duplicateRecords: number; receivedDays: number; insertedOrUpdatedDays: number; chunks: number; successfulChunks: number; failedChunks: SyncChunkFailure[]; retryRanges: { startDate: string; endDate: string }[]; completedAt: string };

function single<T>(rows: T[]): T { if (!rows.length) throw new GrowattError("GROWATT_NO_PLANT", 404); if (rows.length !== 1) throw new GrowattError("GROWATT_UNSUPPORTED_DEVICE", 409); return rows[0]; }
export function defaultHistoricalApi(): HistoricalApi { const token = process.env.GROWATT_API_TOKEN?.trim(); if (!token) throw new GrowattError("GROWATT_NOT_CONFIGURED", 503); return new GrowattOpenApiV1(token, { baseUrl: process.env.GROWATT_API_BASE_URL?.trim() || GROWATT_V1_BASE_URL, maxAttempts: 1 }); }

const defaultSleep = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
async function retryRateLimit<T>(operation: () => Promise<T>, retries: number, sleep: (milliseconds: number) => Promise<void>, retryDelayMs: () => number): Promise<T> { try { return await operation(); } catch (error) { if (retries <= 0 || asGrowattError(error).code !== "GROWATT_RATE_LIMITED") throw error; await sleep(retryDelayMs()); return retryRateLimit(operation, retries - 1, sleep, retryDelayMs); } }

const plantCache = new Map<string, { expiresAt: number; value?: ResolvedPlant; pending?: Promise<ResolvedPlant> }>();
function plantFingerprint() { return createHash("sha256").update([process.env.GROWATT_API_BASE_URL ?? GROWATT_V1_BASE_URL, process.env.GROWATT_CREDENTIAL_VERSION ?? "", process.env.GROWATT_API_TOKEN ?? ""].join("|")).digest("hex"); }
export async function resolveHistoricalPlant(api: HistoricalApi, options: { retries: number; sleep: (milliseconds: number) => Promise<void>; retryDelayMs: () => number; nowMs?: number }): Promise<ResolvedPlant> { const key = plantFingerprint(), now = options.nowMs ?? Date.now(), cached = plantCache.get(key); if (cached?.value && cached.expiresAt > now) return cached.value; if (cached?.pending) return cached.pending; const shared = unstable_cache(async () => single(mapV1Plants(await retryRateLimit(() => api.plantList(), options.retries, options.sleep, options.retryDelayMs))), ["growatt-history-plant", key], { revalidate: 900 }); const pending = shared().then(value => { plantCache.set(key, { value, expiresAt: Date.now() + 15 * 60_000 }); return value; }).catch(error => { plantCache.delete(key); throw error; }); plantCache.set(key, { expiresAt: now + 15 * 60_000, pending }); return pending; }
export function clearHistoricalPlantCacheForTests() { plantCache.clear(); }

export async function syncGrowattHistory(options: { userId: string; startDate: string; endDate: string; database: HistoricalDatabase; api?: HistoricalApi; now?: Date; sleep?: (milliseconds: number) => Promise<void>; retryDelayMs?: () => number; rateLimitRetries?: number; resolvedPlant?: ResolvedPlant }): Promise<GrowattSyncResult> {
  const api = options.api ?? defaultHistoricalApi(), now = options.now ?? new Date(), receivedDates = new Set<string>(), upsertedDates = new Set<string>(), failures: SyncChunkFailure[] = [];
  validateGrowattDateRange(options.startDate, options.endDate, "9999-12-31");
  let coverage: HistoricalCoverageRecord[]; try { coverage = await options.database.existingCoverage(options.userId, options.startDate, options.endDate); } catch { throw new GrowattError("HISTORY_DATABASE_WRITE_FAILED", 503); }
  coverage = coverage.filter(row => row.localDate >= options.startDate && row.localDate <= options.endDate);
  const storedTimezone = coverage.find(row => row.plantTimezone)?.plantTimezone, provisionalDates = new Set(coverage.filter(row => row.qualityStatus === "provisional").map(row => row.localDate));
  const preliminaryCurrentLocalDate = localIsoDate(now, validGrowattTimezone(storedTimezone)), preliminaryCompleteDates = new Set(coverage.filter(row => row.qualityStatus === "complete" && row.localDate !== preliminaryCurrentLocalDate).map(row => row.localDate));
  let missingRanges = missingGrowattDateRanges(options.startDate, options.endDate, preliminaryCompleteDates), requestedDays = validateGrowattDateRange(options.startDate, options.endDate, preliminaryCurrentLocalDate);
  if (!missingRanges.length) return { ok: true, partial: false, startDate: options.startDate, endDate: options.endDate, requestedDays, alreadyStoredDays: coverage.length, alreadyCompleteDays: preliminaryCompleteDates.size, refreshedProvisionalDays: 0, requestedFromGrowattDays: 0, receivedValidDays: 0, upsertedDays: 0, missingDays: 0, invalidRecords: 0, duplicateRecords: 0, receivedDays: 0, insertedOrUpdatedDays: 0, chunks: 0, successfulChunks: 0, failedChunks: [], retryRanges: [], completedAt: new Date().toISOString() };
  const sleep = options.sleep ?? defaultSleep, retryDelayMs = options.retryDelayMs ?? (() => 15_000 + Math.floor(Math.random() * 5_001));
  const retries = options.rateLimitRetries ?? 1, plant = options.resolvedPlant ?? await resolveHistoricalPlant(api, { retries, sleep, retryDelayMs }), timezone = validGrowattTimezone(plant.timezone), currentLocalDate = localIsoDate(now, timezone);
  requestedDays = validateGrowattDateRange(options.startDate, options.endDate, currentLocalDate);
  const completeDates = new Set(coverage.filter(row => row.qualityStatus === "complete" && row.localDate !== currentLocalDate).map(row => row.localDate));
  missingRanges = missingGrowattDateRanges(options.startDate, options.endDate, completeDates);
  const chunks = missingRanges.flatMap(range => chunkGrowattDateRange(range.startDate, range.endDate)); let invalidRecords = 0, duplicateRecords = 0, successfulChunks = 0;
  for (const chunk of chunks) {
    try {
      const raw = await retryRateLimit(() => api.plantEnergyHistory(plant.id, chunk.startDate, chunk.endDate, "day", 1, 20), retries, sleep, retryDelayMs), fetchedAt = new Date().toISOString();
      const mapped = mapGrowattDailyEnergy(raw, { timezone, currentLocalDate, fetchedAt }); invalidRecords += mapped.invalidRecords; duplicateRecords += mapped.duplicateRecords;
      const rows = mapped.rows.filter(row => row.localDate >= chunk.startDate && row.localDate <= chunk.endDate).map(row => dailyDatabaseRow(row, options.userId));
      rows.forEach(row => receivedDates.add(row.local_date));
      if (rows.length) { const { error } = await options.database.upsert(rows); if (error) throw new GrowattError("HISTORY_DATABASE_WRITE_FAILED", 503); }
      rows.forEach(row => upsertedDates.add(row.local_date)); successfulChunks++;
    } catch (error) { failures.push({ startDate: chunk.startDate, endDate: chunk.endDate, code: asGrowattError(error).code }); }
  }
  if (!successfulChunks && failures.length) throw new GrowattError(failures[0].code as ConstructorParameters<typeof GrowattError>[0], failures[0].code === "GROWATT_RATE_LIMITED" ? 429 : 503);
  const receivedValidDays = receivedDates.size, upsertedDays = upsertedDates.size;
  const requestedFromGrowattDays = missingRanges.reduce((sum, range) => sum + validateGrowattDateRange(range.startDate, range.endDate, "9999-12-31"), 0);
  const refreshedProvisionalDays = [...provisionalDates].filter(date => upsertedDates.has(date)).length;
  return { ok: failures.length === 0, partial: failures.length > 0, startDate: options.startDate, endDate: options.endDate, requestedDays, alreadyStoredDays: coverage.length, alreadyCompleteDays: completeDates.size, refreshedProvisionalDays, requestedFromGrowattDays, receivedValidDays, upsertedDays, missingDays: Math.max(0, requestedFromGrowattDays - upsertedDays), invalidRecords, duplicateRecords, receivedDays: receivedValidDays, insertedOrUpdatedDays: upsertedDays, chunks: chunks.length, successfulChunks, failedChunks: failures, retryRanges: failures.map(({ startDate, endDate }) => ({ startDate, endDate })), completedAt: new Date().toISOString() };
}

const running = new Set<string>();
export async function withGrowattSyncLock<T>(userId: string, operation: () => Promise<T>): Promise<T> { if (running.has(userId)) throw new Error("SYNC_ALREADY_RUNNING"); running.add(userId); try { return await operation(); } finally { running.delete(userId); } }
