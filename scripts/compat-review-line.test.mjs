// COMPAT-REVIEW-LINE-1 (2026-11-09, pillar core): qnfo-ops COMPAT-DATE-DECLARED-APPLY-1 advances a worker's live compatibility date only when
// wrangler.toml carries "# compat-advance: reviewed <date>" with declared date <= review date. A declared date later than its review date is
// ignored without any error (PORTFOLIO-DOERS-1: 31 workers deployed at compat_date=2026-10-10 after their toml said 2026-11-04). This test fails the PR instead.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
let bad = 0, checked = 0;
for (const d of readdirSync(root, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const f = join(root, d.name, "wrangler.toml");
  if (!existsSync(f) || existsSync(join(root, d.name, "RETIRED")) || existsSync(join(root, d.name, "FOLDED"))) continue;
  const t = readFileSync(f, "utf8");
  const head = t.split(/^[ \t]*\[/m)[0];
  const dm = /^[ \t]*compatibility_date[ \t]*=[ \t]*"(\d{4}-\d{2}-\d{2})"/m.exec(head);
  const rm = /^#[ \t]*compat-advance:[ \t]*reviewed[ \t]+(\d{4}-\d{2}-\d{2})(?![\d-])/m.exec(t);
  if (!dm || !rm) continue;
  checked++;
  if (dm[1] > rm[1]) { console.log("FAIL " + d.name + ": compatibility_date " + dm[1] + " is after its review date " + rm[1] + " (the deploy gate would never apply it); rerun scripts/compat-risk-scan.mjs and update the compat-advance line"); bad++; }
}
console.log("compat-review-line: " + checked + " checked, " + bad + " failed");
process.exit(bad ? 1 : 0);
