export const formatKwh = (value: number) =>
  new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 1 }).format(value) + " kWh";
export const formatHuf = (value: number) =>
  new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0, style: "currency", currency: "HUF" }).format(value);
export const formatDate = (value: string | Date) =>
  new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
