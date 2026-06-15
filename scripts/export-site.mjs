// content/site.yaml → data/site.js（file:// プレビュー用）
import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = process.cwd();
const CACHE = join(ROOT, ".cache", "export-site");
const EXPORT_SCRIPT = `
const fs = require("fs");
const yaml = require("js-yaml");
const data = yaml.load(fs.readFileSync(${JSON.stringify(join(ROOT, "content/site.yaml"))}, "utf8"));
fs.writeFileSync(
  ${JSON.stringify(join(ROOT, "data/site.js"))},
  "// Auto-generated from content/site.yaml\\nwindow.__NAZEYAMA_SITE__ = " + JSON.stringify(data) + ";\\n"
);
`;

function ensureJsYaml() {
  const mod = join(CACHE, "node_modules", "js-yaml");
  if (existsSync(mod)) return join(CACHE, "node_modules");
  mkdirSync(CACHE, { recursive: true });
  spawnSync("npm", ["init", "-y"], { cwd: CACHE, stdio: "ignore" });
  const install = spawnSync("npm", ["i", "js-yaml"], { cwd: CACHE, stdio: "inherit" });
  if (install.status !== 0) throw new Error("js-yaml install failed");
  return join(CACHE, "node_modules");
}

export async function exportSiteBundle() {
  const nodePath = ensureJsYaml();
  const result = spawnSync(process.execPath, ["-e", EXPORT_SCRIPT], {
    cwd: ROOT,
    env: { ...process.env, NODE_PATH: nodePath },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "site export failed");
  }
  console.log("site bundle exported");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  exportSiteBundle().catch((e) => {
    console.error("site export failed:", e.message);
    process.exitCode = 1;
  });
}
