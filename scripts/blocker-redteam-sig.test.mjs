// REDTEAM-TEXT-SIG-1 offline suite (2026-10-30, charter pillar autonomy; failure mode blocker-verdict-confirmed-expires-daily; agent_issues 1000554).
//
// scripts/blocker_redteam_runner.py wrote no blocker_redteam.text_sig, the only thing that lets v_blocker_claims keep a verdict valid past 24 hours,
// so every automated verdict lapsed daily and the claim returned to unverified_blocker_claims. The runner's own selftest proves, against the REAL
// view text of migrations/2026-10-29-blocker-claims-confirmed-sticks.sql, that a verdict resting on the issue text (IDENTITY-BOUND line, code-task
// line) stays hidden past 24 hours, that a verdict resting on a time-dependent fact (live work claim, token check) returns for its retest, and that
// an edited issue text re-surfaces its claim. That selftest only ran inside the hourly remediation-consumer workflow; this suite puts it in the gate.
// Run: node scripts/blocker-redteam-sig.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + String(d).slice(0, 800))); } };

const src = readFileSync(join(here, "blocker_redteam_runner.py"), "utf8");
ok(/INSERT INTO blocker_redteam \([^)]*text_sig[^)]*\)/.test(src), "record() writes the text_sig column");
ok(/def sig_of\(title, desc\)/.test(src) && /"%d:%d" % \(len\(title or ""\), len\(desc or ""\)\)/.test(src), "the signature is length(title):length(description), the form the view compares");

let py = null;
for (const cand of ["python3", "python"]) {
  const r = spawnSync(cand, ["--version"], { encoding: "utf8" });
  if (r.status === 0) { py = cand; break; }
}
ok(py !== null, "a python interpreter is available");
if (py) {
  const r = spawnSync(py, [join(here, "blocker_redteam_runner.py"), "--selftest"], { encoding: "utf8", timeout: 120000, env: { ...process.env, CLOUDFLARE_API_TOKEN: "", CF_API_TOKEN: "", GITHUB_TOKEN: "", GH_TOKEN: "" } });
  ok(r.status === 0, "blocker_redteam_runner.py --selftest exits 0", (r.stdout || "") + (r.stderr || ""));
  ok(/blocker_redteam_runner selftest ok/.test(r.stdout || ""), "the selftest reaches its final line, including the view round trip");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
