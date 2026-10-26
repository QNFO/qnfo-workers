// BACKUP-PAGED-1 (qnfo-lifecycle 1.15.3) offline suite. No network, synthetic data.
// Proves: the daily 05:00 UTC backup never reads a whole table into memory. Cloudflare Observability recorded
// "Worker invocation ended with exceededMemory" on qnfo-lifecycle at 05:01Z on each day from 2026-10-20 to 2026-10-26 (group a539fdc8);
// the only 05:00-only job is runBackup, whose old `SELECT * FROM papers` held 41 MB of body_md, the JSON text and its encoding at once.
// Here: every D1 read is a bounded keyset page, no R2 object is larger than one part (plus one row), a table that fits keeps the old
// single-object layout, a bigger one is parts plus a manifest that reassemble to exactly the source rows, one table's failure does not
// stop the others, and the scheduled handler logs the result (it used to drop it).
// Run: node qnfo-lifecycle/backup-paged.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { runBackup as __runBackup, backupTable as __backupTable, BACKUP_PAGE_ROWS as __pg, BACKUP_PART_BYTES as __pb };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const PAGE = mod.__pg, PART = mod.__pb;

// A D1 stand-in that answers only the two statements the backup issues and records what it returned per query.
function mkTable(n, bodyChars, firstRowid = 1) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ rowid: firstRowid + i * 2, id: "r" + i, title: "T" + i + " é—", body_md: ("x".repeat(bodyChars - 3)) + i.toString().padStart(3, "0") });
  return rows;
}
function mkD1(rows, log) {
  return {
    prepare(sql) {
      const stmt = { sql, args: [], bind(...a) { stmt.args = a; return stmt; },
        async all() {
          log.push({ sql, args: stmt.args });
          const m = /^SELECT rowid AS _bk_rowid, \* FROM (\w+)( WHERE rowid > \?1)? ORDER BY rowid LIMIT \?(\d)$/.exec(sql);
          if (!m) return { results: [], success: true };
          const after = m[2] ? stmt.args[0] : -Infinity, limit = stmt.args[m[2] ? 1 : 0];
          const out = rows.filter((r) => r.rowid > after).sort((a, b) => a.rowid - b.rowid).slice(0, limit).map((r) => { const { rowid, ...rest } = r; return Object.assign({ _bk_rowid: rowid }, rest); });
          log[log.length - 1].returned = out.length;
          log[log.length - 1].chars = out.reduce((s, r) => s + JSON.stringify(r).length, 0);
          return { results: out, success: true };
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async first() { return null; } };
      return stmt;
    },
  };
}
function mkBucket() { const objs = new Map(); return { objs, async put(key, body, opts) { objs.set(key, { body: String(body), opts }); } }; }
const stripRowid = (rows) => rows.map((r) => { const { rowid, ...rest } = r; return rest; });
const DAY = "2026-10-27";

{ // short rows page wider: 5,401 audit_sessions rows at 10 a page would be 541 reads; a table sets its own page size
  const rows = mkTable(450, 40);
  const log = [], bucket = mkBucket();
  const n = await mod.__backupTable({ BACKUP_BUCKET: bucket }, "qnfo-audit", mkD1(rows, log), "audit_sessions", DAY, 200);
  ok(n === 450 && log.length === 3 && log.every((q) => (q.returned || 0) <= 200) && Math.max(...log.map((q) => q.returned || 0)) === 200, "a 200-row page reads 450 rows in 3 reads", log.map((q) => q.returned));
  ok(bucket.objs.has("qnfo-audit/audit_sessions-" + DAY + ".json") && JSON.parse(bucket.objs.get("qnfo-audit/audit_sessions-" + DAY + ".json").body).length === 450, "and still writes the single object with every row");
  const dflt = []; await mod.__backupTable({ BACKUP_BUCKET: mkBucket() }, "x", mkD1(mkTable(25, 40), dflt), "t", DAY);
  ok(dflt.length === 3, "no page size keeps the default 10-row page", dflt.length);
}
{ // a large table: bounded reads, bounded objects, exact reassembly
  const rows = mkTable(120, 200000); // about 24 MB, like a slice of living-paper.papers
  const log = [], bucket = mkBucket();
  const n = await mod.__backupTable({ BACKUP_BUCKET: bucket }, "living-paper", mkD1(rows, log), "papers", DAY);
  ok(n === 120, "returns the row count", n);
  ok(log.length >= 12 && log.every((q) => /LIMIT \?\d$/.test(q.sql)), "every read is limited and the table is read in many pages", log.length);
  ok(log.every((q) => (q.returned || 0) <= PAGE), "no read returns more than one page of rows", Math.max(...log.map((q) => q.returned || 0)));
  ok(!log.some((q) => /OFFSET/i.test(q.sql)), "keyset pages (rowid >), never OFFSET");
  const man = bucket.objs.get("living-paper/papers-" + DAY + ".manifest.json");
  ok(!!man, "a multi-part table writes a manifest");
  const mf = JSON.parse(man.body);
  ok(mf.rows === 120 && mf.db === "living-paper" && mf.table === "papers" && mf.date === DAY && mf.parts.length >= 5, "the manifest names the table, the date, the row total and the parts", { rows: mf.rows, parts: mf.parts.length });
  ok(!bucket.objs.has("living-paper/papers-" + DAY + ".json"), "a multi-part table does not also write the single object");
  const maxObj = Math.max(...[...bucket.objs.entries()].filter(([k]) => k.includes("/part-")).map(([, v]) => v.body.length));
  ok(maxObj <= PART + 200100, "no part is larger than one part budget plus one row", maxObj);
  const back = [];
  for (const p of mf.parts) { const o = bucket.objs.get(p.key); const arr = JSON.parse(o.body); ok(Array.isArray(arr) && arr.length === p.rows, "part " + p.key + " is a JSON array of its rows"); back.push(...arr); }
  ok(JSON.stringify(back) === JSON.stringify(stripRowid(rows)), "the parts, in manifest order, reassemble to exactly the source rows (no _bk_rowid, rowid order)");
  ok([...bucket.objs.values()].every((o) => o.opts && o.opts.httpMetadata && o.opts.httpMetadata.contentType === "application/json"), "every object is put as application/json");
}

{ // a small table keeps the old layout
  const rows = mkTable(7, 500);
  const log = [], bucket = mkBucket();
  const n = await mod.__backupTable({ BACKUP_BUCKET: bucket }, "portfolio-state", mkD1(rows, log), "resources", DAY);
  const o = bucket.objs.get("portfolio-state/resources-" + DAY + ".json");
  ok(n === 7 && !!o && o.body === JSON.stringify(stripRowid(rows)), "a table under one part is the single object <db>/<table>-<date>.json, byte-identical to JSON.stringify(rows)");
  ok(bucket.objs.size === 1, "and nothing else is written", [...bucket.objs.keys()]);
}

{ // an empty table, and a table whose size is an exact multiple of the page
  const bucket = mkBucket();
  const n0 = await mod.__backupTable({ BACKUP_BUCKET: bucket }, "ipatent-db", mkD1([], []), "submissions", DAY);
  ok(n0 === 0 && bucket.objs.get("ipatent-db/submissions-" + DAY + ".json").body === "[]", "an empty table writes []");
  const rows = mkTable(PAGE * 2, 100), log = [], b2 = mkBucket();
  const n2 = await mod.__backupTable({ BACKUP_BUCKET: b2 }, "qnfo-audit", mkD1(rows, log), "audit_sessions", DAY);
  ok(n2 === PAGE * 2 && log.length === 3 && log[2].returned === 0, "an exact multiple of the page size ends on an empty page, not a loop", log.map((q) => q.returned));
}

{ // gaps in rowid (deleted rows) and negative / large ids do not lose or repeat rows
  const rows = [{ rowid: -5, id: "a" }, { rowid: 3, id: "b" }, { rowid: 4, id: "c" }, { rowid: 1e12, id: "d" }];
  const bucket = mkBucket();
  await mod.__backupTable({ BACKUP_BUCKET: bucket }, "qnfo-audit", mkD1(rows, []), "audit_sessions", DAY);
  ok(JSON.parse(bucket.objs.get("qnfo-audit/audit_sessions-" + DAY + ".json").body).map((r) => r.id).join("") === "abcd", "rowid gaps, negatives and large ids keep every row once");
}

{ // runBackup: per-table isolation and the unchanged result shape
  const bucket = mkBucket();
  const bad = { prepare() { throw new Error("no such table: resources"); } };
  const env = { BACKUP_BUCKET: bucket, PORTFOLIO_STATE: bad, QNFO_AUDIT: mkD1(mkTable(3, 50), []), LIVING_PAPER: mkD1(mkTable(25, 1000), []), IPATENT_DB: mkD1([], []) };
  const r = await mod.__runBackup(env);
  ok(r.status === "backup-complete" && /^\d{4}-\d{2}-\d{2}$/.test(r.dateStamp), "runBackup keeps status and dateStamp", r);
  ok(typeof r.results["portfolio-state"] === "string" && r.results["portfolio-state"].startsWith("error: no such table"), "a failing table is reported as 'error: ...'", r.results);
  ok(r.results["qnfo-audit"] === 3 && r.results["living-paper"] === 25 && r.results["ipatent-db"] === 0, "the other tables are still backed up, with their row counts", r.results);
}

{ // the scheduled handler logs the result, and a failure goes to console.error
  const lines = { log: [], error: [] };
  const real = { log: console.log, error: console.error };
  console.log = (...a) => lines.log.push(a.join(" ")); console.error = (...a) => lines.error.push(a.join(" "));
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  const at = Date.UTC(2026, 9, 27, 5, 0, 3);
  const mk = (bad) => ({ BACKUP_BUCKET: mkBucket(), PORTFOLIO_STATE: bad ? { prepare() { throw new Error("boom"); } } : mkD1(mkTable(2, 30), []), QNFO_AUDIT: mkD1(mkTable(2, 30), []), LIVING_PAPER: mkD1(mkTable(2, 30), []), IPATENT_DB: mkD1([], []) });
  try {
    await mod.default.scheduled({ cron: "0 5 * * *", scheduledTime: at, tickEntry: true }, mk(false), { waitUntil(p) { p.catch(() => {}); } });
    const okLine = lines.log.find((l) => l.startsWith("[qnfo-lifecycle] backup: "));
    ok(!!okLine && JSON.parse(okLine.slice("[qnfo-lifecycle] backup: ".length)).results["living-paper"] === 2, "a clean 05:00 run logs one backup line with the row counts", okLine);
    ok(!lines.error.some((l) => l.startsWith("[qnfo-lifecycle] backup: ")), "and does not log an error");
    await mod.default.scheduled({ cron: "0 5 * * *", scheduledTime: at, tickEntry: true }, mk(true), { waitUntil(p) { p.catch(() => {}); } });
    const badLine = lines.error.find((l) => l.startsWith("[qnfo-lifecycle] backup: "));
    ok(!!badLine && /error: boom/.test(badLine), "a table that failed is logged with console.error (an Observability group, not silence)", badLine);
  } finally { console.log = real.log; console.error = real.error; }
}

{ // source guard: the unbounded read must not come back
  ok(!/"SELECT \* FROM " \+ t\.table/.test(src), "runBackup no longer builds SELECT * FROM <table> without a limit");
  const body = src.slice(src.indexOf("async function backupTable"), src.indexOf("__name(runBackup"));
  ok(/ORDER BY rowid LIMIT/.test(body) && !/\.all\(\)\.results|results\.length/.test(body), "backupTable reads by keyset page and does not hold the whole result");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
