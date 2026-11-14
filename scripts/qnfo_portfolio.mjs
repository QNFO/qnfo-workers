// QNFO-PORTFOLIO-1: every live worker is a QNFO product worker or an Ultrastable core worker, never both, never neither.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { liveWorkers } from "./product_boundary.mjs";

export function checkPortfolio(root, portfolio, boundary) {
  const v = [];
  const live = liveWorkers(root), owner = {};
  for (const [p, def] of Object.entries(portfolio.products)) {
    for (const k of ["program", "plane", "what", "domains", "workers"]) if (def[k] === undefined) v.push(`product ${p} lacks ${k}`);
    for (const w of def.workers || []) { if (owner[w]) v.push(`${w} is in two products: ${owner[w]}, ${p}`); owner[w] = p; }
  }
  for (const w of live) {
    const cls = boundary.workers[w]?.class;
    if (cls === "core") { if (owner[w]) v.push(`core worker ${w} listed in product ${owner[w]}`); }
    else if (!owner[w]) v.push(`live worker ${w} (class ${cls}) is in no QNFO product`);
    else if (cls === "personal" && !/^q08\.org$/.test(portfolio.products[owner[w]].plane)) v.push(`personal worker ${w} sits on plane ${portfolio.products[owner[w]].plane}`);
  }
  for (const [w, p] of Object.entries(owner)) if (!live.includes(w)) v.push(`product ${p} lists non-live worker ${w}`);
  return { ok: !v.length, violations: v, products: Object.keys(portfolio.products).length };
}

// QNFO-PORTFOLIO-2: pure half. accountWorkers: names in the ultrastable account. Returns per core worker: migrated | pilot-only.
export function accountReport(portfolio, boundary, accountWorkers) {
  const map = portfolio.platform.worker_map || {}, onAcct = new Set(accountWorkers);
  const core = Object.entries(boundary.workers).filter(([, v]) => v.class === "core").map(([w]) => w);
  const migrated = new Set(Object.entries(map).filter(([n]) => onAcct.has(n)).map(([, w]) => w));
  const rows = core.map((w) => [w, migrated.has(w) ? "migrated" : "pilot-only"]);
  return { migrated: migrated.size, total: core.length, rows };
}

if (process.argv.includes("--account") && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const portfolio = JSON.parse(readFileSync(join(root, "qnfo/portfolio.json"), "utf8")), boundary = JSON.parse(readFileSync(join(root, "product/boundary.json"), "utf8"));
  const acct = /\(([0-9a-f]{32})\)/.exec(portfolio.platform.cloudflare_account)[1];
  const r = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/workers/scripts`, { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } })).json();
  if (!r.success) { console.log("account read failed: " + JSON.stringify(r.errors).slice(0, 200)); process.exit(1); }
  const rep = accountReport(portfolio, boundary, r.result.map((x) => x.id));
  console.log(`core workers migrated to ultrastable account: ${rep.migrated}/${rep.total}`); rep.rows.forEach(([w, s]) => console.log(`${s}\t${w}`));
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const r = checkPortfolio(root, JSON.parse(readFileSync(join(root, "qnfo/portfolio.json"), "utf8")), JSON.parse(readFileSync(join(root, "product/boundary.json"), "utf8")));
  console.log(`QNFO portfolio: ${r.products} products`); r.violations.forEach((x) => console.log("VIOLATION " + x));
  process.exit(r.ok ? 0 : 1);
}
