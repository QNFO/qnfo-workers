// RETIRED-COPIES-1: RETIREMENT-NOOP-1 (#8712) replaced failed migrations with REAPPLY-OK no-ops. The suites that proved their SQL keep reading the original text
// from migrations/retired/*.sql.txt. A retired copy must never end in .sql (git pathspec 'migrations/*.sql' would hand it to apply-migrations and migration-guard, and
// its APPLY-BY header would apply it again), and its live twin in migrations/ must stay a no-op.
import { readdirSync, readFileSync, existsSync } from "node:fs";
let bad = 0;
const fail = (m) => { bad++; console.log("FAIL " + m); };
const dir = new URL("./retired/", import.meta.url);
const files = readdirSync(dir);
if (files.length === 0) fail("migrations/retired holds the original SQL the suites read");
for (const f of files) {
  if (!f.endsWith(".sql.txt")) { fail(f + " must end in .sql.txt so no migration runner or pathspec sees it"); continue; }
  const live = new URL("../" + f.replace(/\.txt$/, ""), dir);
  if (!existsSync(live)) { fail(f + " has no live twin in migrations/"); continue; }
  const t = readFileSync(live, "utf8");
  if (!/^-- REAPPLY-OK:/m.test(t) || !/^SELECT 1;$/m.test(t)) fail(f.replace(/\.txt$/, "") + " is live again: it must stay the REAPPLY-OK no-op (the original lives in migrations/retired)");
}
if (bad) process.exit(1);
console.log("ok " + files.length + " retired copies, 0 failed");
