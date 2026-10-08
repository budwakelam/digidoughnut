#!/usr/bin/env node
/*
  DigiDoughnut Platform assembler. Developer-side only: buyers never run this.

    node build.mjs demo            -> dist/demo.html
    node build.mjs                 -> every folder in programs/

  Stitches platform/ + programs/<name>/ into ONE self-contained HTML file, then runs
  safety checks. No dependencies: plain Node 18+.
*/
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

// Platform files, in load order. Add new modules here (dd.ai, dd.setup, ... in later phases).
const PLATFORM_VENDOR = ["qrcode-generator.js"];   // MIT, vendored: no outside scripts in the shipped file
const PLATFORM_JS = ["dd.core.js", "dd.store.js", "dd.errors.js", "dd.ui.js", "dd.menu.js", "dd.diag.js", "dd.pair.js", "dd.ai.js", "dd.notes.js", "dd.setup.js", "dd.helper.js", "dd.sync.js", "dd.backup.js", "dd.move.js", "dd.agent.js"];
const PLATFORM_CSS = ["dd.ui.css"];
const WARN_BYTES = 500 * 1024;          // plan target: under 500 KB
const MAX_BYTES = 3 * 1024 * 1024;      // tiiny.host free upload limit

const read = (p) => readFileSync(p, "utf8");
const readIf = (p) => (existsSync(p) ? read(p) : "");

function build(name) {
  const dir = `programs/${name}`;
  const programJs = read(`${dir}/program.js`);

  // The program's id, name and version live in program.js (single source of truth).
  const pick = (field) => (programJs.match(new RegExp(`\\b${field}\\s*:\\s*"([^"]+)"`)) || [])[1];
  const meta = { id: pick("id"), name: pick("name"), version: pick("version"),
                 tagline: pick("tagline") || "", accent: pick("accent") || "#2563eb" };
  if (!meta.id || !meta.name || !meta.version) fail(name, 'program.js needs id, name and version as "quoted" strings');
  if (!/^[a-z0-9]+$/.test(meta.id)) fail(name, `id "${meta.id}" must be lowercase letters/digits only (it becomes part of storage names)`);

  let commit = "local";
  try { commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}
  const built = new Date().toISOString().slice(0, 10);

  const parts = {
    "{{DD_NAME}}": meta.name,
    "{{DD_VERSION}}": meta.version,
    "{{DD_BUILT}}": built,
    "{{DD_ACCENT}}": meta.accent,
    // The page title is what browsers suggest as the bookmark name: "Profit Coach · DigiDoughnut".
    "{{DD_TITLE}}": `${meta.name} · DigiDoughnut`,
    "{{DD_BUILD_JSON}}": JSON.stringify({ built, commit, platform: read("platform/VERSION").trim(), home: homeFor(name), file: `${name}.html` }),
    "/*{{DD_PLATFORM_CSS}}*/": PLATFORM_CSS.map((f) => read(`platform/css/${f}`)).join("\n"),
    "/*{{DD_PROGRAM_CSS}}*/": readIf(`${dir}/program.css`),
    "<!--{{DD_PROGRAM_BODY}}-->": readIf(`${dir}/program.html`),
    "/*{{DD_PLATFORM_JS}}*/": PLATFORM_VENDOR.map((f) => read(`platform/vendor/${f}`)).concat(
                               PLATFORM_JS.map((f) => `/* ---- ${f} ---- */\n` + read(`platform/js/${f}`))).join("\n"),
    "/*{{DD_PROGRAM_JS}}*/": programJs,
  };

  // Code must not contain a literal closing script tag, or the page breaks.
  for (const k of ["/*{{DD_PLATFORM_JS}}*/", "/*{{DD_PROGRAM_JS}}*/"])
    if (/<\/script/i.test(parts[k])) fail(name, `a literal </script> appears in ${k}; write it as "<\\/script>"`);

  // split/join instead of .replace(): replacement text may contain "$&" and friends.
  let html = read("platform/shell.html");
  for (const [marker, value] of Object.entries(parts)) html = html.split(marker).join(value);

  check(name, html);
  mkdirSync("dist", { recursive: true });
  writeFileSync(`dist/${name}.html`, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`✓ dist/${name}.html  (${meta.name} ${meta.version}, ${kb} KB)`);
}

/* Where the DigiDoughnut-hosted copy lives (Phase 7.2). Oran looks after hosting; the build only
   needs the address. build.config.json (optional, not required to build):
     { "home": "https://example.com/apps/{name}.html" }   {name} = the program folder
   or per program: { "homes": { "demo": "https://..." } }. Empty = no hosted copy offered.
   DD_HOME in the environment overrides both (handy for tests). */
function homeFor(name) {
  let cfg = {};
  try { cfg = JSON.parse(readIf("build.config.json") || "{}"); } catch { fail(name, "build.config.json isn't valid JSON"); }
  const raw = process.env.DD_HOME ?? ((cfg.homes && cfg.homes[name]) || cfg.home || "");
  const url = String(raw).split("{name}").join(name).trim();
  if (url && !/^https?:\/\/[^\s]+$/.test(url)) fail(name, `home address "${url}" must start with https://`);
  return url;
}

function check(name, html) {
  const left = html.match(/\{\{DD_[A-Z_]+\}\}/);
  if (left) fail(name, `unfilled marker ${left[0]}`);
  // Vendored libraries only: no external scripts or stylesheets in the shipped file.
  // (The Firebase SDK is loaded later with import(), on purpose, and must never block the page.)
  if (/<script[^>]+src\s*=\s*["']?https?:/i.test(html)) fail(name, "external <script src> found; vendor the library instead");
  if (/<link[^>]+href\s*=\s*["']?https?:/i.test(html)) fail(name, "external <link href> found; inline it instead");
  // Brand spelling: DigiDoughnut, one word, D-O-U-G-H, no S.
  const bad = html.match(/digi[\s-]*do(?:nut|ughnuts|nought)\b|digi[\s-]+doughnut|digidonut/i);
  if (bad) fail(name, `brand misspelled as "${bad[0]}" (it's DigiDoughnut)`);
  const bytes = Buffer.byteLength(html);
  if (bytes > MAX_BYTES) fail(name, `file is ${(bytes / 1048576).toFixed(2)} MB, over tiiny.host's 3 MB limit`);
  if (bytes > WARN_BYTES) console.warn(`! ${name}: ${(bytes / 1024).toFixed(0)} KB is over the 500 KB target`);
}

function fail(name, msg) { console.error(`✗ ${name}: ${msg}`); process.exit(1); }

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : readdirSync("programs", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
names.forEach(build);
