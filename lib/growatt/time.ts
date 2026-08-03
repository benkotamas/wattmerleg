const FALLBACK_TIMEZONE = "Europe/Budapest";

export function validGrowattTimezone(value: string | null | undefined): string {
  const timezone = value || FALLBACK_TIMEZONE;
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); return timezone; }
  catch { return FALLBACK_TIMEZONE; }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
const partsAt = (date: Date, timezone: string): Parts => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  return { year: number("year"), month: number("month"), day: number("day"), hour: number("hour"), minute: number("minute"), second: number("second") };
};
const sameParts = (left: Parts, right: Parts) => Object.keys(left).every(key => left[key as keyof Parts] === right[key as keyof Parts]);

export function growattLocalTimeToUtc(value: string, timezoneValue: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const local: Parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] ?? 0) };
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  const calendarCheck = new Date(localAsUtc);
  if (calendarCheck.getUTCFullYear() !== local.year || calendarCheck.getUTCMonth() !== local.month - 1 || calendarCheck.getUTCDate() !== local.day || local.hour > 23 || local.minute > 59 || local.second > 59) return null;
  const timezone = validGrowattTimezone(timezoneValue);
  let candidate = localAsUtc;
  for (let attempt = 0; attempt < 4; attempt++) {
    const shown = partsAt(new Date(candidate), timezone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    const next = localAsUtc - (shownAsUtc - candidate);
    if (next === candidate) break;
    candidate = next;
  }
  const result = new Date(candidate);
  return sameParts(partsAt(result, timezone), local) ? result.toISOString() : null;
}
