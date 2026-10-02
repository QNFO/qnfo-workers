// HANDOFF-CLAIM-SHEET-1 (qnfo-email 2.2.4): every handoffs insert in worker.js satisfies the qnfo-audit trigger
// handoffs_claim_sheet_required_ins (FRAMEWORK-DOGFOOD-1), which rejected all of them from 2026-09-27.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const stmts = src.match(/INSERT INTO handoffs \([^)]*\) VALUES \(\?1,'qnfo-email',\?2,\?3,\?4,(?:\?5|datetime\('now'\)),json_object\([^)]*\)\)/g) || [];
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE handoffs (id INTEGER PRIMARY KEY, session_id TEXT, project_id TEXT, summary TEXT, pending_work TEXT, next_action TEXT, timestamp TEXT, claim_sheet TEXT); CREATE TRIGGER handoffs_claim_sheet_required_ins BEFORE INSERT ON handoffs WHEN NEW.claim_sheet IS NULL OR length(NEW.claim_sheet) < 3 BEGIN SELECT RAISE(ABORT, 'FRAMEWORK-DOGFOOD-1: handoffs.claim_sheet required'); END;");
let n = 0;
for (const q of stmts) { const args = /\?5/.test(q) ? ["s1", "sum", "pw", "na", "2026-10-02T04:00:00Z"] : ["s2", "sum2", "pw2", "na2"]; db.prepare(q).run(...args); n++; }
let refused = false; try { db.prepare("INSERT INTO handoffs (session_id,project_id,summary,pending_work,next_action,timestamp) VALUES ('x','qnfo-email','s','p','n','t')").run(); } catch (e) { refused = /claim_sheet required/.test(String(e)); }
const rows = db.prepare("SELECT claim_sheet FROM handoffs").all();
console.log(JSON.stringify({ statements: stmts.length, inserted: n, old_form_refused: refused, sample: rows[0] && JSON.parse(rows[0].claim_sheet) }));
if (stmts.length !== 4 || n !== 4 || !refused || JSON.parse(rows[0].claim_sheet).claim !== "sum") process.exit(1);
