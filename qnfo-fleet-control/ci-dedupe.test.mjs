// FIX-VERIFY-1 offline suite for the case-insensitive dedupe guards in qnfo-fleet-control (agent_issues 2782; shipped as
// 0.33.1-ci-dedupe). The unique index idx_agent_issues_open_title_ci is on lower(trim(title)) WHERE status = 'open', so a dedupe guard
// that compares `title = ?1` passes a title that differs only in case or padding and the INSERT then raises the index error; on
// 2026-10-18 one such error inside a fleet_tick trigger rolled the heartbeat back for 144 minutes. The fix gave the dedupe guards the
// index's own comparison, with no live repro (the exceptions had stopped before the deploy). This suite runs the real code against the
// real index in node:sqlite. Proves:
//   - landBundleIssue (sliced from worker.js): the first call files one open row; a repeat files nothing; an open row whose title differs
//     only in case and padding is found by the guard, so the insert is skipped and the unique-index error is NOT raised; a closed row of
//     the same title does not block a new open row (the index is partial);
//   - the metric-trigger dedupe SELECT (extracted verbatim from evaluateMetricTriggers): a title differing only in case or padding finds the
//     open twin, an open row ranks before a monitoring or closed twin, and an unrelated title finds nothing;
//   - every `INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE ...title...)` guard in worker.js compares through
//     lower(trim(title)) = lower(trim(?N)) (or is the prefix LIKE guard), never a bare `title = ?N`;
//   - MUTATION SELF-CHECK: with the guard's comparison reverted to `title = ?1`, or the guard removed, the same scenarios fail by name.
// The `?N` placeholders are rewritten to positional ones so the suite binds the same way on every platform (WINDOWS-SUITE-PARITY-1).
// Run: node --no-warnings qnfo-fleet-control/ci-dedupe.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };

const landBundle = grab("async function landBundleIssue(env, worker, depV, canV, why) {", "\n__name(landBundleIssue");
ok(landBundle.includes("NOT EXISTS (SELECT 1 FROM agent_issues WHERE lower(trim(title)) = lower(trim(?1)) AND status = 'open')"), "landBundleIssue is found in worker.js with the index's own comparison", landBundle.length);

const SCHEMA = `
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
  CREATE UNIQUE INDEX idx_agent_issues_open_title_ci ON agent_issues(lower(trim(title))) WHERE status = 'open';
`;
const mkDb = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const norm = (sql, binds) => {
    if (!/\?\d/.test(sql)) return [sql, binds];
    const args = [];
    return [sql.replace(/\?(\d+)/g, (_, n) => { args.push(binds[Number(n) - 1] === undefined ? null : binds[Number(n) - 1]); return "?"; }), args];
  };
  const stmt = (sql, binds = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => { const [s, a] = norm(sql, binds); return db.prepare(s).get(...a) || null; },
    all: async () => { const [s, a] = norm(sql, binds); return { results: db.prepare(s).all(...a) }; },
    run: async () => { const [s, a] = norm(sql, binds); const r = db.prepare(s).run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { db, env: { AUDIT: { prepare: (sql) => stmt(sql) } } };
};
const TITLE = (w, d, c) => "LAND-BUNDLE-REFUSED-1: " + w + " deployed " + d + " is ahead of main " + c + " as a bundle";
const rows = (db) => db.prepare("SELECT id, title, status FROM agent_issues ORDER BY id").all();
const quiet = async (fn) => { const logged = []; const e = console.error; console.error = (m) => logged.push(String(m)); try { return { value: await fn(), logged }; } finally { console.error = e; } };

// Every scenario returns { name: boolean }; the shipped source must pass all of them and each mutant must fail the named ones.
async function scenarios(fnText) {
  const out = {};
  const lib = new Function("__name", fnText + "\nreturn { landBundleIssue };")((f) => f);
  { const { db, env } = mkDb();
    const r = await quiet(() => lib.landBundleIssue(env, "w", "1.0.0", "0.9.0", "why"));
    out.firstFiles = rows(db).length === 1 && rows(db)[0].status === "open" && rows(db)[0].title === TITLE("w", "1.0.0", "0.9.0") && r.logged.length === 0;
    const again = await quiet(() => lib.landBundleIssue(env, "w", "1.0.0", "0.9.0", "why"));
    out.repeatFilesNothing = rows(db).length === 1 && again.logged.length === 0; }
  { const { db, env } = mkDb();
    // an open row that differs only in case and padding: the 2026-10-18 shape
    db.prepare("INSERT INTO agent_issues (title, status) VALUES (?, 'open')").run("  " + TITLE("w", "1.0.0", "0.9.0").toUpperCase() + " ");
    const r = await quiet(() => lib.landBundleIssue(env, "w", "1.0.0", "0.9.0", "why"));
    out.caseTwinSkipsInsert = rows(db).length === 1 && r.logged.length === 0;
    out.caseTwinRaisesNoIndexError = !r.logged.some((l) => /UNIQUE constraint failed|idx_agent_issues_open_title_ci/.test(l)); }
  { const { db, env } = mkDb();
    db.prepare("INSERT INTO agent_issues (title, status) VALUES (?, 'closed')").run(TITLE("w", "1.0.0", "0.9.0"));
    const r = await quiet(() => lib.landBundleIssue(env, "w", "1.0.0", "0.9.0", "why"));
    out.closedTwinDoesNotBlock = rows(db).length === 2 && rows(db)[1].status === "open" && r.logged.length === 0; }
  { const { db, env } = mkDb();
    db.prepare("INSERT INTO agent_issues (title, status) VALUES (?, 'open')").run(TITLE("other", "1.0.0", "0.9.0"));
    await quiet(() => lib.landBundleIssue(env, "w", "1.0.0", "0.9.0", "why"));
    out.differentTitleFiles = rows(db).length === 2; }
  return out;
}

const real = await scenarios(landBundle);
for (const n of Object.keys(real)) ok(real[n] === true, "landBundleIssue scenario passes on the shipped source: " + n);
ok(Object.keys(real).length === 6, "the landBundleIssue scenario set is complete", Object.keys(real));

const mutants = [
  ["guard reverted to a bare title = ?1", (t) => t.replace("lower(trim(title)) = lower(trim(?1))", "title = ?1"), ["caseTwinSkipsInsert", "caseTwinRaisesNoIndexError"]],
  ["guard removed", (t) => t.replace(/ WHERE NOT EXISTS \(SELECT 1 FROM agent_issues WHERE [^"]*\)"/, '"'), ["repeatFilesNothing", "caseTwinSkipsInsert"]],
];
for (const [label, mutate, mustFail] of mutants) {
  const mutated = mutate(landBundle);
  ok(mutated !== landBundle, "mutant applies to the sliced source: " + label);
  const got = await scenarios(mutated);
  const caught = mustFail.filter((n) => got[n] !== true);
  ok(caught.length === mustFail.length, "mutant '" + label + "' is caught by " + mustFail.join(", "), { caught, failing: Object.keys(got).filter((n) => got[n] !== true) });
}

// The metric-trigger dedupe (METRIC-TRIGGER-TWIN-1 / 0.33.1): the SELECT text is taken verbatim from evaluateMetricTriggers.
const m = /prepare\("(SELECT id, status FROM agent_issues WHERE lower\(trim\(title\)\) = lower\(trim\(\?1\)\) AND status IN \('open','monitoring','closed'\) ORDER BY CASE status[^"]*LIMIT 1)"\)/.exec(src);
ok(!!m, "the metric-trigger dedupe SELECT is found in worker.js with lower(trim(title))");
if (m) {
  const find = async (db, env, title) => (await env.AUDIT.prepare(m[1]).bind(title).first());
  const t0 = "METRIC-TRIGGER-12-OPEN-AGENT-ISSUES: breach";
  { const { db, env } = mkDb();
    db.prepare("INSERT INTO agent_issues (title, status) VALUES (?, 'open')").run(t0);
    const hit = await find(db, env, "  " + t0.toLowerCase() + "  ");
    ok(hit && hit.status === "open", "a title differing only in case and padding finds the open twin", hit);
    ok((await find(db, env, "METRIC-TRIGGER-13-SOMETHING-ELSE: breach")) === null, "an unrelated title finds nothing"); }
  { const { db, env } = mkDb();
    db.prepare("INSERT INTO agent_issues (title, status) VALUES (?, 'closed')").run(t0);
    db.prepare("INSERT INTO agent_issues (title, status) VALUES (?, 'open')").run(t0 + " ");
    const hit = await find(db, env, t0);
    ok(hit && hit.status === "open", "an open row ranks before a closed twin of the same title", hit); }
  { const { db, env } = mkDb();
    db.prepare("INSERT INTO agent_issues (title, status) VALUES (?, 'closed')").run(t0);
    db.prepare("INSERT INTO agent_issues (title, status) VALUES (?, 'monitoring')").run(t0.toLowerCase());
    const hit = await find(db, env, t0.toUpperCase());
    ok(hit && hit.status === "monitoring", "a monitoring twin ranks before a closed one, so the parked row is reopened, not duplicated", hit); }
}

// Structure: every NOT EXISTS dedupe guard that insert-selects into agent_issues compares through the index's own expression.
{
  const re = /NOT EXISTS \(SELECT 1 FROM agent_issues WHERE ([^"`]{0,260}?)\)["`']/g;
  let g, titled = 0, ci = 0, like = 0; const bare = [];
  while ((g = re.exec(src))) {
    if (!/title/.test(g[1])) continue;
    titled++;
    if (/lower\(trim\(title\)\)\s*=\s*lower\(trim\(\?\d+\)\)/.test(g[1])) ci++;
    else if (/title LIKE \?\d+/.test(g[1])) like++;
    else bare.push(g[1].slice(0, 120));
  }
  ok(titled >= 6 && ci >= 5, "worker.js carries the case-insensitive NOT EXISTS guards (at least five)", { titled, ci, like });
  ok(bare.length === 0, "no NOT EXISTS dedupe guard in worker.js compares a bare title = ?N (the index is on lower(trim(title)))", bare);
}

console.log(fail ? fail + " failed, " + pass + " passed" : pass + " passed, 0 failed");
process.exit(fail ? 1 : 0);
