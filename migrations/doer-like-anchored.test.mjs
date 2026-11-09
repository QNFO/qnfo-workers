// DOER-LIKE-ANCHORED-1 (2026-11-09): a migration that assigns a doer (SET linked_session) by title must anchor its pattern.
// '%DOC-%' is case-insensitive in SQLite and matched two issues that were not documents (1002076, 1002539; migrations/2026-11-09-doc-doer-correction.sql).
// Files already merged and applied are never edited (MIGRATION-NO-CLOBBER-1), so they are listed here and corrected by a later migration.
import { readdirSync, readFileSync } from "node:fs";
const dir = new URL("./", import.meta.url);
const MERGED = new Set(["2026-11-09-doc-issue-doers.sql"]);
let bad = 0, checked = 0;
for (const f of readdirSync(dir)) {
  if (!/^2026-11-(0[9]|[1-3]\d)-.*\.sql$/.test(f) || MERGED.has(f)) continue;
  const s = readFileSync(new URL(f, dir), "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  if (!/SET\s+linked_session/i.test(s)) continue;
  checked++;
  if (/LIKE\s+'%[A-Za-z][A-Za-z0-9-]*-%'/i.test(s)) { console.log("FAIL " + f + ": a doer assignment matches an unanchored title pattern (LIKE '%X-%'); anchor it ('X-%') or list ids"); bad++; }
}
console.log("doer-like-anchored: " + checked + " checked, " + bad + " failed");
process.exit(bad ? 1 : 0);
