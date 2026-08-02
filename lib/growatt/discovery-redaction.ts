const STABLE_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_ID = /^\d{4,}$/;
const SERIAL_LIKE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_-]{10,}$/;

export function safeObjectKey(key: string): string {
  if (UUID.test(key) || NUMERIC_ID.test(key) || SERIAL_LIKE.test(key) || !STABLE_FIELD_NAME.test(key)) return "<dynamic-key>";
  return key;
}

export function shapeLines(value: unknown, indent = "", depth = 0): string[] {
  if (depth > 4) return [`${indent}…`];
  if (Array.isArray(value)) return [`${indent}[lista: ${value.length} elem]`, ...(value.length ? shapeLines(value[0], `${indent}  `, depth + 1) : [])];
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    const kind = Array.isArray(item) ? "lista" : item === null ? "null" : typeof item;
    return [`${indent}- ${safeObjectKey(key)}: ${kind}`, ...((Array.isArray(item) || kind === "object") && item !== null ? shapeLines(item, `${indent}  `, depth + 1) : [])];
  });
  return [`${indent}${typeof value}: ****`];
}

export function collectSafePaths(value: unknown, prefix = "", depth = 0): string[] {
  if (depth > 4) return [];
  if (Array.isArray(value)) return value.length ? collectSafePaths(value[0], prefix, depth + 1) : [];
  if (!value || typeof value !== "object") return prefix ? [prefix] : [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    const safeKey = safeObjectKey(key);
    return collectSafePaths(item, prefix ? `${prefix}.${safeKey}` : safeKey, depth + 1);
  });
}
