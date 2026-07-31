import type { MeterReading } from "./types";
import { readingDelta } from "./calculations";

export interface MonthlyStat { month: string; label: string; shortLabel: string; consumption: number; production: number; balance: number; estimated: boolean; }

export function monthlyStatistics(readings: MeterReading[]): MonthlyStat[] {
  const result = new Map<string, MonthlyStat>();
  for (let index = 1; index < readings.length; index++) {
    const previous = readings[index - 1], current = readings[index];
    const delta = readingDelta(previous, current);
    if (delta.elapsedDays <= 0) continue;
    let cursor = new Date(previous.reading_at);
    const end = new Date(current.reading_at);
    while (cursor < end) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const segmentEnd = monthEnd < end ? monthEnd : end;
      const segmentDays = (segmentEnd.getTime() - cursor.getTime()) / 86_400_000;
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const stat = result.get(key) ?? {
        month: key,
        label: new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long" }).format(cursor),
        shortLabel: new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short" }).format(cursor),
        consumption: 0, production: 0, balance: 0, estimated: false,
      };
      const ratio = segmentDays / delta.elapsedDays;
      stat.consumption += delta.consumption * ratio;
      stat.production += delta.production * ratio;
      stat.balance = stat.consumption - stat.production;
      stat.estimated ||= cursor.getMonth() !== end.getMonth();
      result.set(key, stat);
      cursor = segmentEnd;
    }
  }
  return [...result.values()].sort((a, b) => a.month.localeCompare(b.month));
}
