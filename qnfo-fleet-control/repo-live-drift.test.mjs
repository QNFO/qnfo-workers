// REPO-LIVE-DRIFT-1 (#1879): drift_total counts workers whose live version or bytes differ from repo main, and never
// reads a missing or stale fleet self-audit as "no drift".
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- REPO-LIVE-DRIFT-1:BEGIN"), src.indexOf("// ---- REPO-LIVE-DRIFT-1:END"));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(block + "\n__export = { repoLiveDrift, REPO_LIVE_AUDIT_MAX_H, DRIFT_TOTAL_FORMULA, driftParts, driftConfirm, driftDetailText, DRIFT_CONFIRM_PAUSE_MS };", sandbox);
const { repoLiveDrift, REPO_LIVE_AUDIT_MAX_H, DRIFT_TOTAL_FORMULA, driftParts, driftConfirm, driftDetailText, DRIFT_CONFIRM_PAUSE_MS } = sandbox.__export;
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

const NOW = Date.parse("2026-10-05T16:10:00Z");
const snap = (notes, at) => notes.map((n, i) => ({ worker: "w" + i, note: n, probed_at: at || "2026-10-05 16:04:35" }));
// the live snapshot read 2026-10-05 16:04Z: 41 SYNC, CRON_ONLY, NOT_DEPLOYED, NOT_A_WORKER rows, no DRIFT
const clean = snap(Array(41).fill("SYNC").concat(["CRON_ONLY", "NOT_DEPLOYED", "NOT_A_WORKER", "NO_HEALTH_ROUTE"]));
let r = repoLiveDrift(clean, NOW);
check(r.count === 0 && !r.stale && r.age_h === 0.1, "a fresh all-SYNC snapshot adds 0 (age " + r.age_h + "h)");
// seed a known mismatch, see it counted, remove it, see 0 (the definition of done of #1879)
const seeded = clean.concat([{ worker: "personal-api", note: "CONTENT_DRIFT", probed_at: "2026-10-05 16:04:35" }]);
r = repoLiveDrift(seeded, NOW);
check(r.count === 1 && r.drifted[0] === "personal-api:CONTENT_DRIFT", "a live script whose sha256 differs from main counts");
check(repoLiveDrift(clean.concat([{ worker: "x", note: "DRIFT", probed_at: "2026-10-05 16:04:35" }, { worker: "y", note: "NO_REPO_VERSION+DRIFT", probed_at: "2026-10-05 16:04:35" }]), NOW).count === 2, "a version mismatch counts, also inside a combined note");
check(repoLiveDrift(clean.concat([{ worker: "z", note: "NOT_DEPLOYED", probed_at: "2026-10-05 16:04:35" }]), NOW).count === 0, "NOT_DEPLOYED, CRON_ONLY and friends are not repo-vs-live drift");
check(repoLiveDrift(clean, NOW).count === 0, "removing the seeded mismatch reads 0 again");
// an audit that did not run is not a pass
r = repoLiveDrift(snap(["SYNC", "SYNC"], "2026-10-04 12:00:00"), NOW);
check(r.stale && r.count === 1 && /h old/.test(r.why), "a snapshot older than " + REPO_LIVE_AUDIT_MAX_H + "h adds 1 (" + r.why + ")");
r = repoLiveDrift([], NOW);
check(r.stale && r.count === 1, "no snapshot at all adds 1");
check(repoLiveDrift([{ worker: "a", note: "SYNC", probed_at: "2026-10-05T16:00:00.000Z" }], NOW).count === 0, "ISO timestamps are read too");
check(/worker_live_audit/.test(DRIFT_TOTAL_FORMULA) && /sha256/.test(DRIFT_TOTAL_FORMULA), "the registry formula says what is compared");

// DRIFT-CONFIRM-2 (#1993): the terms come from one pure function and name their workers.
const LIVE = ["qnfo-ai", "qnfo-ops", "radar-hub"];
const REG = [{ service: "qnfo-ai", version: "5.31.4", state: "live", kind: "worker" }, { service: "qnfo-ops", version: "2.38.41", state: "live", kind: "worker" }, { service: "radar-hub", version: "1.2.4", state: "live", kind: "worker" }];
let p = driftParts(LIVE, REG, clean, NOW);
check(p.total === 0 && p.ghost === 0 && p.unregistered === 0 && p.unversioned === 0 && p.repo_live.count === 0, "44-for-44 style match reads 0 on every term");
p = driftParts(LIVE.concat(["qnfo-new"]), REG.concat([{ service: "qnfo-gone", version: "1.0.0", state: "live", kind: "worker" }, { service: "qnfo-ops", version: "", state: "live", kind: "worker" }]), clean, NOW);
check(p.ghost === 1 && p.names.ghost[0] === "qnfo-gone", "a registry worker missing from the CF list is a named ghost");
check(p.unregistered === 1 && p.names.unregistered[0] === "qnfo-new", "a CF script missing from the registry is named unregistered");
check(p.unversioned === 1 && p.names.unversioned[0] === "qnfo-ops", "a live worker with an empty registry version is named unversioned");
check(p.total === 3, "total is the sum of the terms (" + p.total + ")");
check(driftParts(LIVE, REG.concat([{ service: "old", version: "1", state: "deleted", kind: "worker" }, { service: "papers", version: null, state: "live", kind: "pages" }]), clean, NOW).total === 0, "deleted rows and non-worker kinds are not ghosts or unversioned");
check(driftParts(LIVE, REG, [], NOW).total === 1 && driftParts(LIVE, REG, [], NOW).repo_live.stale, "a missing self-audit still adds 1 through repo_live");
// a non-zero first read is confirmed by a second read; the smaller value is written
const z = driftParts(LIVE, REG, clean, NOW), one = driftParts(LIVE, REG, seeded, NOW);
let c = driftConfirm(one, z);
check(c.value === 0 && c.transient && !c.confirmed && c.first === 1 && c.second === 0, "first 1, second 0 -> writes 0 and is marked transient (the 18:00:13Z case)");
c = driftConfirm(one, one);
check(c.value === 1 && c.confirmed && !c.transient, "first 1, second 1 -> confirmed 1");
c = driftConfirm(z, null);
check(c.value === 0 && !c.confirmed && !c.transient && c.second === null, "a zero first read needs no second read");
c = driftConfirm(one, null);
check(c.value === 1 && c.confirmed, "a non-zero first read with an unreadable second read is written as read (never hidden)");
check(driftConfirm(driftParts(LIVE, REG, seeded.concat([{ worker: "q", note: "DRIFT", probed_at: "2026-10-05 16:04:35" }]), NOW), one).value === 1, "two reads disagreeing above zero write the smaller");
// the detail row names the term and the workers
let t = driftDetailText(driftConfirm(one, z));
check(/transient/.test(t) && /first read 1/.test(t) && /wrote 0/.test(t) && /repo_live personal-api:CONTENT_DRIFT/.test(t), "transient text names the term: " + t);
t = driftDetailText(driftConfirm(p, p));
check(/ghost qnfo-gone/.test(t) && /unregistered qnfo-new/.test(t) && /unversioned qnfo-ops/.test(t) && /drift_total 3/.test(t), "confirmed text names every term: " + t);
check(/audit no fleet self-audit rows/.test(driftDetailText(driftConfirm(driftParts(LIVE, REG, [], NOW), null))), "a stale or missing audit is named as a term");
check(driftDetailText(null).length > 0 && driftDetailText(driftConfirm(null, null)).length > 0, "detail text never throws on empty input");
check(DRIFT_CONFIRM_PAUSE_MS >= 10000 && DRIFT_CONFIRM_PAUSE_MS <= 60000, "the confirm pause is between 10s and 60s");
// the writer is wired: one read, a pause and a second read only when the first is non-zero, the detail row only then
check(/var first = await readDriftParts\(\);/.test(src) && /if \(first\.total > 0\) \{\s*await new Promise\(function \(r\) \{ setTimeout\(r, DRIFT_CONFIRM_PAUSE_MS\); \}\);/.test(src), "refreshOwnedMetrics pauses and re-reads only on a non-zero first read");
check(/var conf = driftConfirm\(first, second\);\s*await put\("drift_total", conf\.value\);/.test(src), "the confirmed value is what is written");
check(/'drift-total-detail'/.test(src) && /driftDetailText\(conf\)/.test(src), "a non-zero first read leaves a drift-total-detail event");
check(/re-read once after a 20s pause/.test(DRIFT_TOTAL_FORMULA), "the registry formula states the confirm rule");
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
