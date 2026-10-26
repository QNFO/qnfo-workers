// CLOSE-CHANNEL-GUARD-1 (agent_issues 100419 CLOSE-CHANNEL-REQUIRED-1; pillar autonomy).
//
// Issue 100419's definition of done is "every UPDATE agent_issues SET status IN (closed, resolved, wontfix) path writes close_channel". A close with no channel cannot be
// attributed to a fix, a probe or a sweep. The leak was closed site by site (PR 3478, PR 3506, the conflict_repair.py and apply_migrations.py settle closes of 2026-10-26),
// and nothing stopped the next site from forgetting the column: the NULL count only showed it two days later. This suite is that stop. It reads every file that can write
// to agent_issues from a deployed Worker or a CI script and fails when a statement sets status to closed, resolved or wontfix and names no close_channel in its SET list.
//
//   Scanned   : <dir>/worker.js for every directory that carries no RETIRED or FOLDED marker, and scripts/*.py|*.mjs that are not tests.
//   Not scanned: deployed-current.worker.js (a byte-identical mirror, held equal by mirror-guard), *.test.mjs, *_test.py, migrations/ (one-off SQL with its own review),
//                RETIRED and FOLDED directories (never deployed: qnfo-pipeline-ops and qnfo-skill-sync still hold unchannelled closes and may keep them).
//   Limits    : a statement that binds the status (SET status = ?1) cannot be judged from text and is not flagged; D1 triggers and owner-chat session SQL are outside
//               the repository text. Session SQL closes still write no channel; they are the residual recorded on the issue, not something this suite can see.
//
// Run: node --no-warnings scripts/close-channel-guard.test.mjs
//   CCG_EXTRA=<file> adds one more file to the scan (a mutated copy must fail), used by the mutation check below.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const CLOSED = /\bstatus\s*=\s*(?:'|")(closed|resolved|wontfix)(?:'|")/i;

// -> [{ line, sql }] for each statement that closes agent_issues rows without naming close_channel.
export function unchannelledCloses(text) {
  const out = [];
  const re = /UPDATE\s+agent_issues\s+SET\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 1200);
    const w = rest.search(/\bWHERE\b/i);
    const setList = w >= 0 ? rest.slice(0, w) : rest;
    if (!CLOSED.test(setList)) continue;
    if (/\bclose_channel\b/i.test(setList)) continue;
    out.push({ line: text.slice(0, m.index).split("\n").length, sql: (m[0] + setList).replace(/\s+/g, " ").slice(0, 200) });
  }
  return out;
}

// ---- the scanner itself, on fixtures (a guard that cannot fail guards nothing) ----
ok(unchannelledCloses(`db.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2")`).length === 1, "a close with no close_channel is flagged");
ok(unchannelledCloses(`db.prepare("UPDATE agent_issues SET status='closed', close_channel='auto:x', updated_at=?1 WHERE id=?2")`).length === 0, "a close that names close_channel passes");
ok(unchannelledCloses(`db.prepare("UPDATE agent_issues SET close_channel = 'auto:x', status = 'resolved' WHERE id=?2")`).length === 0, "close_channel before status passes");
ok(unchannelledCloses(`"UPDATE agent_issues SET status = 'wontfix', updated_at = ? WHERE source = 'kaizen-ai'"`).length === 1, "wontfix is a close");
ok(unchannelledCloses(`"UPDATE agent_issues SET status='open', updated_at=?1 WHERE id=?2 AND status='closed'"`).length === 0, "a reopen whose WHERE mentions closed is not a close");
ok(unchannelledCloses(`"UPDATE agent_issues SET priority='high' WHERE status IN ('closed')"`).length === 0, "a priority change is not a close");
ok(unchannelledCloses(`"UPDATE agent_issues SET description = description || 'x' WHERE id = 1"`).length === 0, "a description edit is not a close");
ok(unchannelledCloses(`"UPDATE agent_issues SET status = ?1 WHERE id = ?2"`).length === 0, "a bound status cannot be judged from text and is not flagged (documented limit)");
ok(unchannelledCloses(`"UPDATE agent_issues\n   SET status = 'closed',\n       updated_at = 1\n WHERE id = 2"`).length === 1, "a close split over lines is found");
ok(unchannelledCloses(`UPDATE   agent_issues   SET   status="closed"`).length === 1, "a close with no WHERE and double quotes is found");
ok(unchannelledCloses(`"UPDATE agent_issues SET status='closed', close_channel='a' WHERE id=1"; "UPDATE agent_issues SET status='closed' WHERE id=2"`).length === 1, "only the unchannelled one of two statements is flagged");

// ---- the repository ----
const MARKERS = ["RETIRED", "FOLDED"];
function liveWorkerFiles() {
  const files = [];
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    let st; try { st = statSync(dir); } catch (e) { continue; }
    if (!st.isDirectory() || name === "node_modules" || name.startsWith(".")) continue;
    if (MARKERS.some((mk) => existsSync(join(dir, mk)))) continue;
    const w = join(dir, "worker.js");
    if (existsSync(w)) files.push(w);
  }
  return files;
}
// A harness that runs its statements on an in-memory SQLite copy and says so is not a writer to qnfo-audit. The exemption is kept honest below: the file must still state it never touches D1.
const SCRATCH_ONLY = { "agent_issues_trigger_equivalence.py": "It runs entirely in memory. It never touches D1" };
function scriptFiles() {
  const dir = join(root, "scripts");
  return readdirSync(dir)
    .filter((n) => /\.(py|mjs)$/.test(n) && !/(\.test\.mjs|_test\.py|-test\.py)$/.test(n) && !(n in SCRATCH_ONLY))
    .map((n) => join(dir, n));
}
const files = [...liveWorkerFiles(), ...scriptFiles()];
if (process.env.CCG_EXTRA) files.push(resolve(process.env.CCG_EXTRA));

for (const [n, phrase] of Object.entries(SCRATCH_ONLY)) {
  ok(readFileSync(join(root, "scripts", n), "utf8").includes(phrase), "the scratch-only exemption for scripts/" + n + " still holds: the file says '" + phrase + "'");
}
ok(files.length > 40,"the scan sees the deployed Workers and the scripts (found " + files.length + ")");
ok(files.some((f) => f.endsWith(join("qnfo-fleet-control", "worker.js"))) && files.some((f) => f.endsWith(join("scripts", "conflict_repair.py"))), "it includes qnfo-fleet-control/worker.js and scripts/conflict_repair.py");
ok(!files.some((f) => f.endsWith(join("qnfo-pipeline-ops", "worker.js"))) && !files.some((f) => f.endsWith(join("qnfo-skill-sync", "worker.js"))), "RETIRED directories are not scanned (qnfo-pipeline-ops, qnfo-skill-sync)");
ok(!files.some((f) => /deployed-current/.test(f) || /\.test\.mjs$|_test\.py$/.test(f)), "mirrors and tests are not scanned");

let sites = 0;
const bad = [];
for (const f of files) {
  let text; try { text = readFileSync(f, "utf8"); } catch (e) { continue; }
  sites += (text.match(/UPDATE\s+agent_issues\s+SET\b/gi) || []).length;
  for (const v of unchannelledCloses(text)) bad.push(relative(root, f).replace(/\\/g, "/") + ":" + v.line + " " + v.sql);
}
ok(sites > 30, "the scan sees the UPDATE agent_issues statements of the fleet (found " + sites + ")");
ok(bad.length === 0, "every statement that closes an agent_issues row in a deployed Worker or a CI script names close_channel (CLOSE-CHANNEL-REQUIRED-1)", bad);

console.log(fail === 0 ? "close-channel-guard: " + pass + " checks passed, " + sites + " UPDATE agent_issues statements in " + files.length + " files" : "close-channel-guard: " + fail + " FAILED, " + pass + " passed");
process.exit(fail === 0 ? 0 : 1);
