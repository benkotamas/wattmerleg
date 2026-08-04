import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(process.cwd());
const output = resolve(process.argv[2] ?? join(root, "wattmerleg-safe.zip"));
const stage = mkdtempSync(join(tmpdir(), "wattmerleg-pack-"));

export function safePackagePath(filePath) {
  const path = filePath.replaceAll("\\", "/");
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  if (path === ".env.example") return true;
  if (name === ".env" || name.startsWith(".env.")) return false;
  if (/(^|\/)(?:\.git|\.next|node_modules|\.npm-cache)(?:\/|$)/i.test(path)) return false;
  if (/\.(?:zip|log|tsbuildinfo)$/i.test(path)) return false;
  if (/^data\/.*\.xlsx$/i.test(path)) return false;
  return true;
}

try {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  }).split(/\r?\n/).filter(Boolean).filter(safePackagePath);

  for (const file of files) {
    const source = join(root, file);
    const target = join(stage, file);
    if (!existsSync(source)) continue;
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }

  mkdirSync(dirname(output), { recursive: true });
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${stage.replaceAll("'", "''")}\\*' -DestinationPath '${output.replaceAll("'", "''")}' -Force`,
  ], { stdio: "inherit" });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  else process.stdout.write(`Safe archive: ${basename(output)}\n`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
