export function localIsoDate(date: Date, timeZone = "Europe/Budapest"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function weatherRequestKind(logDate: string, now: Date, timeZone = "Europe/Budapest"): "historical" | "forecast" {
  return logDate < localIsoDate(now, timeZone) ? "historical" : "forecast";
}
