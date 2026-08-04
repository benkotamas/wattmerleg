import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(process.cwd());
const output = resolve(process.argv[2] ?? join(root, "wattmerleg-safe.zip"));
const stage = mkdtempSync(join(tmpdir(), "wattmerleg-pack-"));
const BINARY_ALLOWLIST = new Set(["vendor/xlsx-0.20.3.tgz"]);
const VENDOR_SHA256 = "8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8";
const JWT = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/;
const SUPABASE_SECRET = /\bsb_secret_[A-Za-z0-9_-]{16,}\b/;
const SECRET_KEY = /(?:GROWATT|EON|GMAIL)_[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD)|(?:GROWATT|EON|GMAIL)_[A-Z0-9_]*(?:API|PRIVATE|SERVICE|ACCESS|CLIENT)_KEY|SUPABASE_SERVICE_ROLE(?:_KEY)?/g;

class PackSafetyError extends Error {
  constructor(file, code) { super(code); this.file = file; this.code = code; }
}

export function safePackagePath(filePath) {
  const path = filePath.replaceAll("\\", "/");
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  if (path === ".env.example") return true;
  if (name === ".env" || name.startsWith(".env.")) return false;
  if (/(^|\/)(?:\.git|\.next|node_modules|\.npm-cache)(?:\/|$)/i.test(path)) return false;
  if (/\.(?:zip|xlsx|log|tsbuildinfo)$/i.test(path)) return false;
  return true;
}

function allowedPlaceholder(value) {
  const unquoted = value.trim().replace(/[,;]\s*$/, "").trim().replace(/^(['"])(.*)\1$/, "$2").trim();
  return unquoted === "" || unquoted === "[SENSITIVE]" || /^YOUR_[A-Z0-9_]+$/.test(unquoted) || /^https:\/\/YOUR_[A-Z0-9_.-]+(?:\/.*)?$/i.test(unquoted);
}

function localSecretValues() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !/(?:TOKEN|SECRET|PASSWORD|SERVICE_ROLE|ALLOWED_USER_ID|ANON_KEY|EMAIL)/.test(match[1])) return [];
    const value = match[2]?.replace(/^['"]|['"]$/g, "") ?? "";
    return value.length >= 6 && !allowedPlaceholder(value) ? [value] : [];
  });
}

function strictText(bytes, relativePath) {
  let content;
  try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new PackSafetyError(relativePath, "PACK_UNSUPPORTED_BINARY"); }
  if (/\0|[\x01-\x08\x0B\x0C\x0E-\x1F]/.test(content)) throw new PackSafetyError(relativePath, "PACK_UNSUPPORTED_BINARY");
  return content;
}

function skipTrivia(content, start) {
  let offset = start, sawNewline = false;
  while (offset < content.length) {
    if (/\s/.test(content[offset])) { if (content[offset] === "\n" || content[offset] === "\r") sawNewline = true; offset++; continue; }
    if (content.startsWith("/*", offset)) {
      const end = content.indexOf("*/", offset + 2);
      if (end < 0) return { offset: content.length, sawNewline: true };
      if (/\r|\n/.test(content.slice(offset, end + 2))) sawNewline = true;
      offset = end + 2;
      continue;
    }
    break;
  }
  return { offset, sawNewline };
}

function assignedSecretValues(content) {
  const values = [];
  SECRET_KEY.lastIndex = 0;
  for (const match of content.matchAll(SECRET_KEY)) {
    const index = match.index ?? 0;
    if (index > 0 && !/[\s."'{\[,:>$]/.test(content[index - 1])) continue;
    let cursor = skipTrivia(content, index + match[0].length);
    if (content[cursor.offset] === '"' || content[cursor.offset] === "'") cursor = skipTrivia(content, cursor.offset + 1);
    if (content[cursor.offset] === "]") cursor = skipTrivia(content, cursor.offset + 1);
    if (content[cursor.offset] !== "=" && content[cursor.offset] !== ":") continue;
    cursor = skipTrivia(content, cursor.offset + 1);
    const quote = content[cursor.offset];
    if (quote === '"' || quote === "'" || quote === "`") {
      const end = content.indexOf(quote, cursor.offset + 1);
      values.push(end < 0 ? content.slice(cursor.offset + 1) : content.slice(cursor.offset + 1, end));
      continue;
    }
    if (content.startsWith("[SENSITIVE]", cursor.offset)) { values.push("[SENSITIVE]"); continue; }
    if (cursor.sawNewline) { values.push(""); continue; }
    const token = content.slice(cursor.offset).match(/^[^\s,;}\]]*/)?.[0] ?? "";
    values.push(token);
  }
  return values;
}

function scanStagedFile(relativePath, secrets) {
  const normalized = relativePath.replaceAll("\\", "/");
  const absolute = join(stage, relativePath);
  if (!statSync(absolute).isFile()) return;
  if (BINARY_ALLOWLIST.has(normalized)) {
    const digest = createHash("sha256").update(readFileSync(absolute)).digest("hex");
    if (digest !== VENDOR_SHA256) throw new PackSafetyError(normalized, "PACK_BINARY_INTEGRITY_MISMATCH");
    return;
  }
  const content = strictText(readFileSync(absolute), normalized);
  if (JWT.test(content) || SUPABASE_SECRET.test(content)) throw new PackSafetyError(normalized, "PACK_SECRET_PATTERN");
  if (assignedSecretValues(content).some(value => !allowedPlaceholder(value))) throw new PackSafetyError(normalized, "PACK_SECRET_ASSIGNMENT");
  if (secrets.some(secret => content.includes(secret))) throw new PackSafetyError(normalized, "PACK_LOCAL_SECRET_MATCH");
}

function stageFiles() {
  const result = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) result.push(relative(stage, absolute).replaceAll("\\", "/"));
      else throw new PackSafetyError(relative(stage, absolute), "PACK_UNSUPPORTED_FILE");
    }
  };
  visit(stage);
  return result.sort();
}

function createArchive() {
  const testMode = process.env.WATTMERLEG_PACK_TEST_ARCHIVER_MODE;
  if (testMode === "missing") return;
  if (testMode === "empty") { writeFileSync(output, Buffer.alloc(0)); return; }
  if (testMode === "invalid") { writeFileSync(output, "not a zip", "utf8"); return; }
  const script = `
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stage = $env:WATTMERLEG_PACK_STAGE
$output = $env:WATTMERLEG_PACK_OUTPUT
$archive = [System.IO.Compression.ZipFile]::Open($output, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath $stage -Recurse -File | ForEach-Object {
    $entryName = $_.FullName.Substring($stage.Length).TrimStart([char]92, [char]47).Replace('\\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    stdio: "inherit",
    env: { ...process.env, WATTMERLEG_PACK_STAGE: stage, WATTMERLEG_PACK_OUTPUT: output },
  });
  if (result.status !== 0) throw new PackSafetyError("<archive>", "PACK_ARCHIVE_FAILED");
}

function zipEntries(bytes) {
  if (bytes.length < 22) throw new PackSafetyError("<archive>", "PACK_ARCHIVE_INVALID");
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0 || eocd + 22 + bytes.readUInt16LE(eocd + 20) !== bytes.length) throw new PackSafetyError("<archive>", "PACK_ARCHIVE_INVALID");
  const count = bytes.readUInt16LE(eocd + 10), size = bytes.readUInt32LE(eocd + 12), start = bytes.readUInt32LE(eocd + 16);
  if (start + size !== eocd) throw new PackSafetyError("<archive>", "PACK_ARCHIVE_INVALID");
  const names = [];
  let offset = start;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > eocd || bytes.readUInt32LE(offset) !== 0x02014b50) throw new PackSafetyError("<archive>", "PACK_ARCHIVE_INVALID");
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > eocd) throw new PackSafetyError("<archive>", "PACK_ARCHIVE_INVALID");
    const name = strictText(bytes.subarray(offset + 46, offset + 46 + nameLength), "<archive>");
    if (!name || name.includes("\\")) throw new PackSafetyError("<archive>", "PACK_ARCHIVE_INVALID");
    names.push(name);
    offset = end;
  }
  if (offset !== eocd || new Set(names).size !== names.length) throw new PackSafetyError("<archive>", "PACK_ARCHIVE_INVALID");
  return names.sort();
}

function verifyArchive(expected) {
  if (!existsSync(output) || !statSync(output).isFile() || statSync(output).size === 0) throw new PackSafetyError("<archive>", "PACK_ARCHIVE_INVALID");
  const actual = zipEntries(readFileSync(output));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new PackSafetyError("<archive>", "PACK_ARCHIVE_CONTENT_MISMATCH");
  if (!actual.includes("package-lock.json") || !actual.includes("vendor/xlsx-0.20.3.tgz")) throw new PackSafetyError("<archive>", "PACK_ARCHIVE_CONTENT_MISMATCH");
  if (actual.some(name => /(^|\/)\.env(?:\.local)?$|\.(?:xlsx|zip|log|tsbuildinfo)$/i.test(name))) throw new PackSafetyError("<archive>", "PACK_ARCHIVE_FORBIDDEN_ENTRY");
}

function validateOutputPath() {
  if (extname(output).toLowerCase() !== ".zip") throw new PackSafetyError("<output>", "PACK_OUTPUT_INVALID");
  if (existsSync(output) && !statSync(output).isFile()) throw new PackSafetyError("<output>", "PACK_OUTPUT_INVALID");
  const relativeOutput = relative(root, output).replaceAll("\\", "/");
  if (!relativeOutput.startsWith("../") && relativeOutput !== "..") {
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativeOutput], { cwd: root, stdio: "ignore" });
    if (tracked.status === 0) throw new PackSafetyError("<output>", "PACK_OUTPUT_INVALID");
  }
}

let outputValidated = false;
try {
  validateOutputPath();
  outputValidated = true;
  rmSync(output, { force: true });
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/).filter(Boolean).filter(safePackagePath);
  for (const file of files) {
    const source = join(root, file), target = join(stage, file);
    if (!existsSync(source)) continue;
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: false });
  }
  const expected = stageFiles();
  if (process.env.WATTMERLEG_PACK_TEST_CORRUPT_VENDOR === "1") writeFileSync(join(stage, "vendor/xlsx-0.20.3.tgz"), "corrupt", "utf8");
  const secrets = localSecretValues();
  for (const file of expected) scanStagedFile(file, secrets);
  mkdirSync(dirname(output), { recursive: true });
  createArchive();
  verifyArchive(expected);
  process.stdout.write(`Safe archive: ${basename(output)}\n`);
} catch (error) {
  if (outputValidated) rmSync(output, { force: true });
  if (error instanceof PackSafetyError) process.stderr.write(`${error.code} ${error.file.replaceAll("\\", "/")}\n`);
  else process.stderr.write("PACK_FAILED <internal>\n");
  process.exitCode = 1;
} finally {
  rmSync(stage, { recursive: true, force: true });
}
