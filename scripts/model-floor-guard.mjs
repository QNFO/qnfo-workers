// model-floor-guard.mjs - MODEL-FLOOR-1 enforcement (RECURRENCE-ZERO-1 gate).
// Scans repo worker sources AND live deployed bundles for banned (sub-frontier) models.
// Exit 0 = clean; exit 1 = code-level violation. Comment mentions + BANNED-list
// declarations are skipped (a comment may name a banned model only for documentation).
//
// Usage:
//   node model-floor-guard.mjs                 # repo scan (default)
//   node model-floor-guard.mjs --live          # repo + live bundles
//   node model-floor-guard.mjs --json          # machine-readable summary

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO = process.env.QNFO_WORKERS || "C:/Users/LENOVO/Documents/GitHub/qnfo-workers";
const ACCT = process.env.CF_ACCOUNT_ID || "edb167b78c9fb901ea5bca3ce58ccc4b";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;

const BANNED = [
  { label: "llama", re: /(@cf\/(meta|meta-llama)\/llama[\w.-]*|\bllama-[\d.]+[\w.-]*)/i },
  { label: "mistral-7b", re: /(@cf\/mistral\/mistral-7b[\w.-]*|mistral-7b[\w.-]*)/i },
  { label: "gemma-small", re: /(@cf\/google\/gemma-(2b|7b|3-12b)[\w.-]*|gemma-(2b|7b|3-12b)[\w.-]*)/i },
  { label: "qwen2.5-coder-32b", re: /qwen2\.5-coder-32b[\w.-]*/i },
  { label: "qwen3-30b", re: /qwen3-30b[\w.-]*/i },
  { label: "qwq-32b", re: /qwq-32b[\w.-]*/i },
  { label: "r1-distill-32b", re: /deepseek-r1-distill-qwen-32b[\w.-]*/i },
  { label: "gemma-4-26b", re: /gemma-4-26b[\w.-]*/i },
  { label: "glm-4.7-flash", re: /glm-4\.7-flash[\w.-]*/i },
  { label: "glm-5.2", re: /glm-5\.2(?![\d.])[\w.-]*/i },
];

// MODEL-FLOOR-1 precision (2026-10-17): a model name in a TRAILING comment is documentation, not a selection.
// The old scan tested the whole line, so `var VERSION = "1.5.5"; // ... probes llama ...` and every
// `/* 1.5.1 ... llama ... */` note was reported as a code-level violation (ai-health-prober:6,
// qnfo-ai-calibration:6/857, qnfo-intent-orchestrator:8). Strip the trailing line comment first, honouring
// quotes so a `//` inside a string is not mistaken for one.
function codePart(line) {
  let out = "";
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      out += ch;
      if (ch === "\\") { out += line[i + 1] || ""; i++; } else if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; out += ch; continue; }
    if (ch === "/" && line[i + 1] === "/") break;                       // line comment to EOL
    if (ch === "/" && line[i + 1] === "*") {                            // inline block comment
      const end = line.indexOf("*/", i + 2);
      if (end < 0) break;
      i = end + 1;
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

// A price/attribution/cap table names a model to PRICE or DESCRIBE it, not to call it: `var __AI_ATTR_RATES = {
// "@cf/...": [in, out] }`, `var REASONING_TOKENS = {...}`, `COST_TIER_PRICES`, and a bare `"<model id>": <value>`
// row. 18 of the 65 findings on 2026-10-17 were these rows. A list of ids to call (`PANEL_POOL`, `models: [...]`,
// `HEDGE_ORDER`) is NOT exempt: its key is not a model id, so it still has to name frontier models only.
const TABLE_VAR_RE = /(?:^|[\s({,])(?:(?:var|let|const)\s+)?[A-Za-z_$][\w$]*(?:RATES|PRICES|TOKENS|CAPS|ALIASES|VENDOR|CATALOG|META|COSTS|TIERS)\s*=/;
const MODEL_KEY_ROW_RE = /^\s*["']?[@a-z0-9][\w.@/\/-]*["']?\s*:\s*[\[{"'\d]/;
const MODEL_IDLIKE_RE = /^(?:@cf\/|llama|qwen|gemma|glm|kimi|deepseek|gpt-oss|mistral|qwq|nemotron|bge)/i;
function isDeclRow(code) {
  if (TABLE_VAR_RE.test(code)) return true;
  const m = MODEL_KEY_ROW_RE.exec(code);
  if (!m) return false;
  const key = m[0].replace(/[\s:"']/g, "");
  return MODEL_IDLIKE_RE.test(key);
}

function scan(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let inBanList = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (/\b(BANNED|DENY|BLOCK|FORBID)[\w_]*\s*=/.test(line)) inBanList++;
    else if (inBanList > 0 && /\]/.test(line)) inBanList = Math.max(0, inBanList - 1);
    const isComment = t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
    const isOk = line.indexOf("MODEL-FLOOR-OK") >= 0;
    const code = isComment ? "" : codePart(line);
    if (!code) continue;
    const isBanCtx = inBanList > 0 || /\b(BANNED|DENY|BLOCK|FORBID)[\w_]*\b/i.test(line) || isDeclRow(code);
    for (const b of BANNED) {
      if (b.re.test(code)) {
        const kind = (isOk || isBanCtx) ? "banlist" : "VIOLATION";
        out.push({ line: i + 1, label: b.label, kind, text: t.slice(0, 110) });
        break;
      }
    }
  }
  return out;
}

export { BANNED, scan };

function scanRepo() {
  const res = [];
  let dirs = [];
  try { dirs = fs.readdirSync(REPO, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return [{ name: "(repo unreadable)", hits: [] }]; }
  for (const d of dirs) {
    const f = path.join(REPO, d, "worker.js");
    if (!fs.existsSync(f)) continue;
    const hits = scan(fs.readFileSync(f, "utf8"));
    const v = hits.filter((h) => h.kind === "VIOLATION");
    if (v.length) res.push({ name: d, hits: v });
  }
  return res;
}

async function scanLive() {
  const res = [];
  if (!TOKEN) return [{ name: "(no CF token)", hits: [] }];
  let list = [];
  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCT + "/workers/scripts", { headers: { Authorization: "Bearer " + TOKEN } });
    list = ((await r.json()).result || []).map((x) => x.id).sort();
  } catch { return [{ name: "(live list failed)", hits: [] }]; }
  const cap = 6;
  for (let i = 0; i < list.length; i += cap) {
    const chunk = list.slice(i, i + cap);
    await Promise.all(chunk.map(async (name) => {
      try {
        const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCT + "/workers/scripts/" + name + "/content/v2", { headers: { Authorization: "Bearer " + TOKEN } });
        if (!r.ok) return;
        const hits = scan(await r.text()).filter((h) => h.kind === "VIOLATION");
        if (hits.length) res.push({ name, hits });
      } catch {}
    }));
  }
  res.sort((a, b) => a.name.localeCompare(b.name));
  return res;
}

// ENTRY-POINT-1 (2026-10-17): run the scan only when this file IS the process entry point, and compare paths
// portably. `import.meta.url === "file://" + process.argv[1]` (the pattern run-suites.mjs had) never matches on
// Windows, so the script printed nothing and exited 0 - a silent pass. pathToFileURL normalises both sides.
// The module also exports scan/BANNED so an audit script can reuse the exact rules instead of a copy.
function isEntry() {
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; } catch { return false; }
}

async function main() {
  const wantLive = process.argv.includes("--live");
  const wantJson = process.argv.includes("--json");
  const repo = scanRepo();
  const live = wantLive ? await scanLive() : [];

  if (wantJson) {
    console.log(JSON.stringify({ repo, live }, null, 1));
  } else {
    const show = (title, rows) => {
      console.log("== " + title + " (" + rows.length + " workers with code-level violations)");
      for (const r of rows) {
        console.log("  " + r.name);
        for (const h of r.hits.slice(0, 6)) console.log("      L" + h.line + " [" + h.label + "] " + h.text);
      }
    };
    show("REPO SOURCES", repo);
    if (wantLive) show("LIVE BUNDLES", live);
  }

  const total = repo.length + live.length;
  process.exit(total > 0 ? 1 : 0);
}

if (isEntry()) await main();
