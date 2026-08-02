import "dotenv/config";
import { readFile } from "node:fs/promises";
import { collectSafePaths, shapeLines } from "../lib/growatt/discovery-redaction";

const args = new Map<string, string>();
const queries: string[] = [];
for (let index = 2; index < process.argv.length; index++) {
  const item = process.argv[index];
  if (!item.startsWith("--")) continue;
  const [key, inline] = item.slice(2).split("=", 2);
  const next = process.argv[index + 1];
  const value = inline ?? (!next?.startsWith("--") ? (index++, next) : "true");
  if (key === "query") queries.push(value); else args.set(key, value);
}

const token = process.env.GROWATT_API_TOKEN?.trim();
const base = args.get("base-url");
const authHeader = args.get("auth-header");
const authTemplate = args.get("auth-value-template");
const plantsPath = args.get("plants-path");
const method = (args.get("method") ?? "GET").toUpperCase();

if (!token) {
  console.error("Growatt discovery: GROWATT_API_TOKEN nincs beállítva."); process.exitCode = 1;
} else if (!base || !authHeader || !authTemplate?.includes("{token}") || !plantsPath || !["GET", "POST"].includes(method)) {
  console.error("Használat: npm run growatt:discover -- --base-url https://… --auth-header … --auth-value-template \"{token}\" --plants-path /… [--method GET|POST] [--query key=value] [--body-file request.json] [--field-map-template]");
  process.exitCode = 1;
} else void discover();

async function discover() {
  try {
    const body = await loadBody();
    const requests = [{ label: "Plant-lista", path: plantsPath! }];
    if (args.get("devices-path")) requests.push({ label: "Device-lista", path: fill(args.get("devices-path")!) });
    if (args.get("latest-path")) requests.push({ label: "Latest adat", path: fill(args.get("latest-path")!) });
    for (const request of requests) {
      const raw = await probe(request.path, body);
      console.log(`${request.label}: sikeres`);
      console.log("Válasz szerkezete:");
      for (const line of shapeLines(raw)) console.log(line);
      if (args.has("field-map-template")) console.log(JSON.stringify({ availablePaths: collectSafePaths(raw), mapping: {} }, null, 2));
    }
  } catch (error) {
    console.error(error instanceof Error && error.name === "AbortError" ? "Growatt kapcsolat: időtúllépés" : error instanceof Error ? error.message : "Growatt kapcsolat: a válasz nem olvasható.");
    process.exitCode = 1;
  }
}

async function loadBody() {
  const file = args.get("body-file");
  if (!file) return undefined;
  try { return JSON.parse(await readFile(file, "utf8")) as unknown; }
  catch { throw new Error("A JSON body fájl nem olvasható vagy érvénytelen."); }
}

async function probe(path: string, body: unknown) {
  const url = new URL(path, base!);
  for (const item of queries) {
    const separator = item.indexOf("=");
    if (separator < 1) throw new Error("A query formátuma key=value legyen.");
    url.searchParams.append(item.slice(0, separator), item.slice(separator + 1));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { method, headers: { Accept: "application/json", [authHeader!]: authTemplate!.replaceAll("{token}", token!), ...(method === "POST" && body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: method === "POST" && body !== undefined ? JSON.stringify(body) : undefined, signal: controller.signal });
    if (!response.ok) throw new Error(`Growatt kapcsolat: sikertelen (HTTP ${response.status})`);
    return await response.json() as unknown;
  } finally { clearTimeout(timer); }
}

function fill(template: string) {
  return template.replaceAll("{plantId}", encodeURIComponent(args.get("plant-id") ?? "")).replaceAll("{deviceId}", encodeURIComponent(args.get("device-id") ?? "")).replaceAll("{serialNumber}", encodeURIComponent(args.get("serial-number") ?? ""));
}
