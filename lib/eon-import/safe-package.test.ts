import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

function runPack(output: string, env: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, ["scripts/pack-safe.mjs", output], { encoding: "utf8", env: { ...process.env, ...env } });
}

function temporaryRootFile(extension: string, content: string | Buffer) {
  const path = join(process.cwd(), `pack-regression-${randomUUID()}${extension}`);
  writeFileSync(path, content);
  return path;
}

function expectBlocked(path: string, expectedCode = "PACK_SECRET_ASSIGNMENT", forbiddenOutput?: string) {
  const dir = mkdtempSync(join(tmpdir(), "pack-blocked-")), zip = join(dir, "unsafe.zip");
  try {
    const result = runPack(zip);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(expectedCode);
    if (forbiddenOutput) expect(`${result.stdout}\n${result.stderr}`).not.toContain(forbiddenOutput);
    expect(result.stdout).not.toContain("Safe archive");
    expect(existsSync(zip)).toBe(false);
  } finally {
    rmSync(path, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}

const fakeValue = () => ["definitely", "fake", randomUUID()].join("-");
const key = (...parts: string[]) => parts.join("_");

describe("safe package szöveg- és bináris ellenőrzés", () => {
  it("SVG-ben levő Gmail secretet blokkol", () => {
    const name = key("GMAIL", "CLIENT", "SECRET");
    expectBlocked(temporaryRootFile(".svg", `<svg><text>${name}=${fakeValue()}</text></svg>`));
  });

  it("webmanifestben levő Growatt tokent blokkol", () => {
    const name = key("GROWATT", "API", "TOKEN");
    expectBlocked(temporaryRootFile(".webmanifest", JSON.stringify({ [name]: fakeValue() })));
  });

  it("kiterjesztés nélküli E.ON passwordöt blokkol", () => {
    const name = key("EON", "PORTAL", "PASSWORD");
    expectBlocked(temporaryRootFile("", `export ${name}=${fakeValue()}`));
  });

  it("JSON secret assignmentet blokkol", () => {
    const name = key("GMAIL", "CLIENT", "SECRET");
    expectBlocked(temporaryRootFile(".json", JSON.stringify({ [name]: fakeValue() })));
  });

  it("TypeScript string assignmentet blokkol", () => {
    const name = key("GMAIL", "CLIENT", "SECRET");
    expectBlocked(temporaryRootFile(".ts", `const ${name} = "${fakeValue()}";`));
  });

  it("process.env assignmentet blokkol", () => {
    const name = key("GMAIL", "CLIENT", "SECRET");
    expectBlocked(temporaryRootFile(".mjs", `process.env.${name} = "${fakeValue()}";`));
  });

  it("objektumtulajdonság-assignmentet blokkol", () => {
    const name = key("GMAIL", "CLIENT", "SECRET");
    expectBlocked(temporaryRootFile(".js", `config.${name} = "${fakeValue()}";`));
  });

  it("többsoros assignmentet blokkol", () => {
    const name = key("GMAIL", "CLIENT", "SECRET");
    expectBlocked(temporaryRootFile(".ts", `const ${name} =\n  "${fakeValue()}";`));
  });

  it("kommenttel megszakított assignmentet blokkol", () => {
    const name = key("GMAIL", "CLIENT", "SECRET");
    expectBlocked(temporaryRootFile(".ts", `${name} /* explanatory comment */ = "${fakeValue()}";`));
  });

  it("process.env dupla idézőjeles bracket assignmentet blokkol és nem írja ki az értéket", () => {
    const name = key("GMAIL", "CLIENT", "SECRET"), value = fakeValue();
    expectBlocked(temporaryRootFile(".js", `process.env["${name}"] = "${value}";`), "PACK_SECRET_ASSIGNMENT", value);
  });

  it("process.env egyszeres idézőjeles bracket assignmentet blokkol", () => {
    const name = key("GMAIL", "CLIENT", "SECRET");
    expectBlocked(temporaryRootFile(".js", `process.env['${name}'] = '${fakeValue()}';`));
  });

  it("objektumtulajdonság bracket assignmentet blokkol", () => {
    const name = key("GROWATT", "API", "TOKEN");
    expectBlocked(temporaryRootFile(".js", `config['${name}'] = '${fakeValue()}';`));
  });

  it("számított objektumliterál-kulcsot blokkol", () => {
    const name = key("EON", "PORTAL", "PASSWORD");
    expectBlocked(temporaryRootFile(".js", `const config = { ["${name}"]: "${fakeValue()}" };`));
  });

  it("többsoros és kommentes bracket assignmentet blokkol", () => {
    const name = key("GMAIL", "CLIENT", "SECRET");
    expectBlocked(temporaryRootFile(".js", `process.env[\n /* comment */\n "${name}"\n ] /* assignment */ =\n "${fakeValue()}";`));
  });

  it("bracket notation placeholder értékeket engedélyez", () => {
    const name = key("GMAIL", "CLIENT", "SECRET"), path = temporaryRootFile(".js", `process.env["${name}"] = "YOUR_CLIENT_SECRET";\nconfig["${name}"] = "[SENSITIVE]";\nconfig['${name}'] = "";`);
    const dir = mkdtempSync(join(tmpdir(), "pack-bracket-placeholder-")), zip = join(dir, "safe.zip");
    try {
      const result = runPack(zip);
      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(zip)).toBe(true);
    } finally { rmSync(path, { force: true }); rmSync(dir, { recursive: true, force: true }); }
  }, 20_000);

  it("puszta bracket property readet és hasOwn ellenőrzést engedélyez", () => {
    const name = key("GMAIL", "CLIENT", "SECRET"), path = temporaryRootFile(".js", `const value = process.env["${name}"];\nconsole.log(Object.hasOwn(config, "${name}"));`);
    const dir = mkdtempSync(join(tmpdir(), "pack-bracket-read-")), zip = join(dir, "safe.zip");
    try {
      const result = runPack(zip);
      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(zip)).toBe(true);
    } finally { rmSync(path, { force: true }); rmSync(dir, { recursive: true, force: true }); }
  }, 20_000);

  it("biztonságos placeholder formákat engedélyez", () => {
    const name = key("GMAIL", "CLIENT", "SECRET"), path = temporaryRootFile(".toml", `${name}=YOUR_CLIENT_SECRET\nexport ${name}=[SENSITIVE]\n"${name}": "YOUR_SECRET"\nprocess.env.${name} =\n  "YOUR_CLIENT_SECRET"\n${name}:\n`);
    const dir = mkdtempSync(join(tmpdir(), "pack-placeholder-")), zip = join(dir, "safe.zip");
    try {
      const result = runPack(zip);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("Safe archive");
      expect(existsSync(zip)).toBe(true);
    } finally { rmSync(path, { force: true }); rmSync(dir, { recursive: true, force: true }); }
  }, 20_000);

  it("ismeretlen bináris fájlt blokkol", () => {
    expectBlocked(temporaryRootFile(".bin", Buffer.from([0xff, 0x00, 0x81])), "PACK_UNSUPPORTED_BINARY");
  });
});

describe("safe ZIP eredményellenőrzés", () => {
  it("package-lockot és az allowlistelt vendor tarballt tartalmazza, tiltott fájlt nem", () => {
    const dir = mkdtempSync(join(tmpdir(), "pack-safe-")), zip = join(dir, "safe.zip");
    try {
      const result = runPack(zip);
      expect(result.status).toBe(0);
      const tar = spawnSync("tar", ["-tf", zip], { encoding: "utf8" });
      expect(tar.status).toBe(0);
      const names = tar.stdout.replaceAll("\\", "/").split(/\r?\n/).filter(Boolean);
      expect(names).toContain("package-lock.json");
      expect(names).toContain("vendor/xlsx-0.20.3.tgz");
      expect(names.every(name => !name.includes("\\"))).toBe(true);
      expect(names.some(name => /\.env\.local$|\.xlsx$|\.zip$|\.log$|\.tsbuildinfo$/i.test(name))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 20_000);

  it.each(["missing", "empty", "invalid"])("hamis archiválási siker (%s) nem készít elfogadott ZIP-et", mode => {
    const dir = mkdtempSync(join(tmpdir(), "pack-invalid-")), zip = join(dir, "unsafe.zip");
    try {
      const result = runPack(zip, { WATTMERLEG_PACK_TEST_ARCHIVER_MODE: mode });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("PACK_ARCHIVE_INVALID <archive>");
      expect(result.stdout).not.toContain("Safe archive");
      expect(existsSync(zip)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 20_000);

  it("módosított vendor tarballt integritáshibával blokkol", () => {
    const dir = mkdtempSync(join(tmpdir(), "pack-vendor-")), zip = join(dir, "unsafe.zip");
    try {
      const result = runPack(zip, { WATTMERLEG_PACK_TEST_CORRUPT_VENDOR: "1" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("PACK_BINARY_INTEGRITY_MISMATCH vendor/xlsx-0.20.3.tgz");
      expect(result.stdout).not.toContain("Safe archive");
      expect(existsSync(zip)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(["package.json", "README.md"])("hibás output útvonal (%s) tartalmát nem törli vagy módosítja", outputName => {
    const path = join(process.cwd(), outputName);
    const before = createHash("sha256").update(readFileSync(path)).digest("hex");
    const result = runPack(path);
    const after = createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("PACK_OUTPUT_INVALID <output>");
    expect(result.stdout).not.toContain("Safe archive");
    expect(after).toBe(before);
  });
});
