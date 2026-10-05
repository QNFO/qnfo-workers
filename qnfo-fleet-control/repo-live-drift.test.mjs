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
vm.runInContext(block + "\n__export = { repoLiveDrift, REPO_LIVE_AUDIT_MAX_H, DRIFT_TOTAL_FORMULA };", sandbox);
const { repoLiveDrift, REPO_LIVE_AUDIT_MAX_H, DRIFT_TOTAL_FORMULA } = sandbox.__export;
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
console.log(fails + " failure(s)");
process.exit(fails ? 1 : 0);
