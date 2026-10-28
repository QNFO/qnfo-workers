// BP26-AI-ACT-ART50-1 / BP26-PROVENANCE-MARKING-1 offline suite: replays migrations/2026-10-28-art50-paper-provenance.sql (living-paper) and 2026-10-28-art50-asset-provenance.sql
// (qnfo-audit) on node:sqlite. Proves: headers; backfill gives every slugged paper 'fleet-generated' and flags a body that claims human review; the CHECK refuses a human-reviewed value
// without a reviewer; the insert trigger gives a new paper its row; a replay changes nothing; the ledger table accepts a signed row and refuses an unknown manifest kind.
// Output MUST contain "0 failed" on success.   node migrations/art50-provenance.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (p) => new URL(p, import.meta.url);
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
for (const [f, db] of [["2026-10-28-art50-paper-provenance.sql", "living-paper"], ["2026-10-28-art50-asset-provenance.sql", "qnfo-audit"]]) {
  const sql = readFileSync(here("./" + f), "utf8");
  const h = sql.split("\n").filter((l) => l.startsWith("--"));
  ok(h.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && h.some((l) => l === "-- DB: " + db) && h.filter((l) => /^-- Rollback: /.test(l)).length === 1, f + " header");
  const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
  ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/\bLIKE\s+'[^']{50,}'/i.test(body), f + " destroys nothing");
}
function run(db, sql) { // statements split on ";\n" outside the single trigger body
  const parts = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n").split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  let buf = "";
  for (const p of parts) { buf += (buf ? ";\n" : "") + p; if (/CREATE TRIGGER/i.test(buf) && !/\bEND$/i.test(buf.trim()) && !/\bEND;?$/i.test(buf.trim())) continue; db.exec(buf); buf = ""; }
  if (buf) db.exec(buf);
}
const lp = new DatabaseSync(":memory:");
lp.exec("CREATE TABLE papers (identifier TEXT, slug TEXT, status TEXT, body_md TEXT, change_actor TEXT)");
lp.prepare("INSERT INTO papers VALUES (?,?,?,?,?)").run("a", "plain", "published", "Use of AI. Text.", null);
lp.prepare("INSERT INTO papers VALUES (?,?,?,?,?)").run("b", "claims-review", "published", "All claims were Reviewed and validated by the human author.", null);
lp.prepare("INSERT INTO papers VALUES (?,?,?,?,?)").run("c", null, "draft", "x", null);
const msql = readFileSync(here("./2026-10-28-art50-paper-provenance.sql"), "utf8");
run(lp, msql);
let rows = lp.prepare("SELECT slug, provenance, declaration_conflict FROM paper_provenance ORDER BY slug").all();
ok(rows.length === 2 && rows.every((r) => r.provenance === "fleet-generated"), "backfill: every slugged paper is fleet-generated, the slugless one has no row", rows);
ok(rows.find((r) => r.slug === "claims-review").declaration_conflict === 1 && rows.find((r) => r.slug === "plain").declaration_conflict === 0, "a body that claims human review is flagged, a plain one is not", rows);
let threw = false; try { lp.exec("UPDATE paper_provenance SET provenance = 'ai-assisted-human-reviewed' WHERE slug = 'plain'"); } catch (e) { threw = true; }
ok(threw, "the CHECK refuses a human-reviewed value without a reviewer");
lp.exec("UPDATE paper_provenance SET provenance = 'ai-assisted-human-reviewed', reviewed_by = 'owner' WHERE slug = 'plain'");
ok(lp.prepare("SELECT provenance FROM paper_provenance WHERE slug='plain'").get().provenance === "ai-assisted-human-reviewed", "a named reviewer allows the value");
lp.prepare("INSERT INTO papers VALUES (?,?,?,?,?)").run("d", "new-paper", "draft", "t", "qnfo-research-exec:publish:new-paper:x");
const nr = lp.prepare("SELECT provenance, set_by FROM paper_provenance WHERE slug='new-paper'").get();
ok(nr && nr.provenance === "fleet-generated" && nr.set_by.includes("qnfo-research-exec"), "the insert trigger gives a new paper its row, with the writer's actor", nr);
run(lp, msql);
ok(lp.prepare("SELECT COUNT(*) n FROM paper_provenance").get().n === 3 && lp.prepare("SELECT provenance FROM paper_provenance WHERE slug='plain'").get().provenance === "ai-assisted-human-reviewed", "a replay changes nothing");

const au = new DatabaseSync(":memory:");
const asql = readFileSync(here("./2026-10-28-art50-asset-provenance.sql"), "utf8");
run(au, asql); run(au, asql);
au.prepare("INSERT INTO asset_provenance (asset_id, kind, url, sha256, manifest_url, key_id, signed_at) VALUES (?,?,?,?,?,?,?)").run("paper:x@1", "paper-html", "https://papers.qnfo.org/papers/x", "ab", "https://papers.qnfo.org/papers/x/provenance.json", "k1", "2026-10-28T00:00:00Z");
ok(au.prepare("SELECT manifest_kind FROM asset_provenance").get().manifest_kind === "signed-sidecar", "the ledger takes a signed row, default kind signed-sidecar");
threw = false; try { au.prepare("INSERT INTO asset_provenance (asset_id, kind, url, sha256, manifest_kind, manifest_url, key_id, signed_at) VALUES ('y','k','u','s','x','m','k','t')").run(); } catch (e) { threw = true; }
ok(threw, "an unknown manifest kind is refused");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
