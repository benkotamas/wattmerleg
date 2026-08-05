import type { MeterReading, SettlementPeriod } from "@/lib/types";

export const ENERGY_PAGE_SIZE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

export type EnergyPageLoader<T> = (from: number, to: number) => PromiseLike<PageResult<T>>;

async function readAllPages<T extends { id: string }>(loadPage: EnergyPageLoader<T>): Promise<T[]> {
  const rows = new Map<string, T>();
  for (let from = 0; ; from += ENERGY_PAGE_SIZE) {
    const result = await loadPage(from, from + ENERGY_PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    for (const row of page) if (!rows.has(row.id)) rows.set(row.id, row);
    if (page.length < ENERGY_PAGE_SIZE) break;
  }
  return [...rows.values()];
}

export async function readAllMeterReadings(loadPage: EnergyPageLoader<MeterReading>): Promise<MeterReading[]> {
  const rows = await readAllPages(loadPage);
  return rows.sort((left, right) => left.reading_at.localeCompare(right.reading_at) || left.id.localeCompare(right.id));
}

export async function readAllSettlementPeriods(loadPage: EnergyPageLoader<SettlementPeriod>): Promise<SettlementPeriod[]> {
  const rows = await readAllPages(loadPage);
  return rows.sort((left, right) => left.start_date.localeCompare(right.start_date) || left.id.localeCompare(right.id));
}
