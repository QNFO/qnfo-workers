// PRD-FUNNEL-INHOUSE-1 + CADENCE-SOCIAL-SHARES-1 offline suite for migrations/2026-10-27-prd-funnel-inhouse-model.sql.
// Proves: the CI headers and the BACKUP line are present; the new v_prd_funnel_publications counts the in-house address as deposit
// evidence and a slug-joined dissemination post id as distribution evidence, while staying strict (age over 120 minutes, a post with
// no post_id proves nothing, a slug is matched exactly, the 30 day window, the old DOI join still works); the health view and the stage
// view keep working on top of it; the social cadence interval moves from 120 to 1440 and nothing else in cadence_sla changes; the
// decision_log row is written once; a second apply changes nothing.
// Run: node migrations/prd-funnel-inhouse-model.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-27-prd-funnel-inhouse-model.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const header = (k) => { const m = sql.match(new RegExp("^--\\s*" + k + ":\\s*(.+)$", "m")); return m ? m[1].trim() : null; };
ok(header("APPLY-BY") === "ci", "header APPLY-BY: ci");
ok(header("DB") === "qnfo-audit", "header DB: qnfo-audit");
ok(header("BACKUP") === "bak_prd_funnel_view_20261027", "header BACKUP names the table the file creates", header("BACKUP"));
const code = sql.split(/\r?\n/).filter((l) => !l.startsWith("--")).join("\n");
ok(/CREATE TABLE IF NOT EXISTS bak_prd_funnel_view_20261027/.test(code) && code.indexOf("bak_prd_funnel_view_20261027 AS") < code.indexOf("DROP VIEW IF EXISTS v_prd_funnel_publications;"), "the backup table is created before the first DROP (statements, not comments)");
ok(/CREATE VIEW v_prd_funnel_publications AS/.test(header("Rollback") || ""), "Rollback line recreates the old view");
ok(/interval_min=120/.test(header("Rollback") || ""), "Rollback line restores the 120 minute interval");

const d = new DatabaseSync(":memory:");
const all = (q, ...p) => d.prepare(q).all(...p);
const one = (q, ...p) => d.prepare(q).get(...p);
const iso = (offMin) => new Date(Date.now() + offMin * 60000).toISOString().replace(/\.\d+Z$/, "Z");
d.exec(`
CREATE TABLE research_queue (id TEXT PRIMARY KEY, paper_slug TEXT, status TEXT, published_at TEXT, doi TEXT);
CREATE TABLE entity_map (slug TEXT PRIMARY KEY, doi TEXT, page_url TEXT, utm_campaign TEXT, post_uri TEXT, buffer_id TEXT, updated_at TEXT);
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, buffer_id TEXT, paper_doi TEXT, status TEXT DEFAULT 'published');
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT NOT NULL, channel TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'posted', post_id TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, formula TEXT);
CREATE TABLE cadence_sla (surface TEXT PRIMARY KEY, producer TEXT NOT NULL, interval_min INTEGER NOT NULL CHECK (interval_min >= 10), sla_min INTEGER NOT NULL CHECK (sla_min BETWEEN 10 AND 120 AND sla_min % 10 = 0), schedule TEXT, last_output TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE reach_signals (source TEXT, entity_type TEXT, metric TEXT, quality TEXT, value REAL, date TEXT);
CREATE TABLE subscribers (status TEXT, confirmed_at TEXT);
CREATE TABLE fleet_runs (task_id TEXT, status TEXT, finished_at TEXT);
-- the old (pre-migration) view and stage view, as migrations/2026-10-25-prd-funnel-monitor.sql defined them
CREATE VIEW v_prd_funnel_publications AS SELECT q.id, q.paper_slug, q.published_at, 0 AS has_deposit, 0 AS has_page_mapping, 0 AS has_distribution, 0 AS age_min FROM research_queue q;
CREATE VIEW v_prd_funnel_publication_stages AS SELECT 'publication' AS stage, 'research_queue' AS source, COUNT(*) AS value, MAX(published_at) AS latest_at, 'old' AS limitation FROM v_prd_funnel_publications;
CREATE VIEW v_prd_funnel_health AS
SELECT (SELECT COUNT(*) FROM v_prd_funnel_publications WHERE age_min>120 AND (has_deposit=0 OR has_page_mapping=0 OR has_distribution=0)) AS missing_transitions;
INSERT INTO metric_registry (metric, formula) VALUES ('prd_funnel_missing_transitions', 'old formula'), ('other_metric', 'untouched');
INSERT INTO cadence_sla (surface, producer, interval_min, sla_min, schedule, last_output) VALUES
 ('social', 'qnfo-social', 120, 120, 'the owner''s weekly channel caps; social runs every 2 hours', 'social_media_posts.published_at'),
 ('q08.org', 'q08-signal-engine', 120, 120, 'q08 schedule', 'q08'),
 ('papers.qnfo.org', 'qnfo-research-exec', 120, 120, 'papers schedule', 'papers');
`);
const p = (id, slug, ageMin, doi) => d.prepare("INSERT INTO research_queue (id, paper_slug, status, published_at, doi) VALUES (?,?, 'published', ?, ?)").run(id, slug, iso(-ageMin), doi || null);
const em = (slug, page, doi) => d.prepare("INSERT INTO entity_map (slug, page_url, doi) VALUES (?,?,?)").run(slug, page, doi || null);
const ds = (id, slug, postId, action) => d.prepare("INSERT INTO dissemination_tracker (id, paper_slug, channel, action, post_id) VALUES (?,?, 'bluesky', ?, ?)").run(id, slug, action || "posted", postId);

// A: page + identified dissemination post, no DOI -> complete (the 317 live case)
p("A", "a-paper", 600); em("a-paper", "https://papers.qnfo.org/papers/a-paper"); ds("dA", "a-paper", "at://did:plc:x/app.bsky.feed.post/1");
// B: page but only a posted row with an empty post_id -> distribution missing (a post without an identifier proves nothing)
p("B", "b-paper", 600); em("b-paper", "https://papers.qnfo.org/papers/b-paper"); ds("dB", "b-paper", "");
// C: page, no dissemination row at all -> distribution missing
p("C", "c-paper", 600); em("c-paper", "https://papers.qnfo.org/papers/c-paper");
// D: no entity_map row at all (the 17 live case) -> deposit and page missing
p("D", "d-paper", 600);
// E: page and a dissemination row whose slug only CONTAINS the paper slug -> no substring match, distribution missing
p("E", "e-paper", 600); em("e-paper", "https://papers.qnfo.org/papers/e-paper"); ds("dE", "e-paper-extended", "at://did:plc:x/app.bsky.feed.post/5");
// F: legacy DOI path still works: DOI on the queue row, a social post joined by DOI, no page mapping needed for deposit
p("F", "f-paper", 600, "10.9999/third-party-f"); em("f-paper", "https://papers.qnfo.org/papers/f-paper");
d.prepare("INSERT INTO social_media_posts (id, platform, post_id, paper_doi, status) VALUES ('sF','buffer-x','buf-1','10.9999/third-party-f','published')").run();
// G: younger than 120 minutes -> never counted, even though nothing exists yet
p("G", "g-paper", 30);
// H: older than 30 days -> outside the window
p("H", "h-paper", 31 * 24 * 60);
// I: a dissemination row with action other than posted -> distribution missing
p("I", "i-paper", 600); em("i-paper", "https://papers.qnfo.org/papers/i-paper"); ds("dI", "i-paper", "at://did:plc:x/app.bsky.feed.post/9", "queued");

d.exec(sql);
const rows = Object.fromEntries(all("SELECT id, has_deposit dep, has_page_mapping pg, has_distribution dist FROM v_prd_funnel_publications").map((r) => [r.id, r]));
ok(Object.keys(rows).length === 8 && !rows.H, "30 day window: H is out, the other eight are in", Object.keys(rows));
ok(rows.A.dep === 1 && rows.A.pg === 1 && rows.A.dist === 1, "A: in-house page and an identified post is complete without a DOI", rows.A);
ok(rows.B.dep === 1 && rows.B.dist === 0, "B: a posted row with an empty post_id is not distribution", rows.B);
ok(rows.C.dep === 1 && rows.C.dist === 0, "C: no dissemination row is not distribution", rows.C);
ok(rows.D.dep === 0 && rows.D.pg === 0 && rows.D.dist === 0, "D: no entity_map row misses deposit, page and distribution", rows.D);
ok(rows.E.dist === 0, "E: slug match is exact, not a substring", rows.E);
ok(rows.F.dep === 1 && rows.F.dist === 1, "F: the DOI join still counts for a third-party DOI", rows.F);
ok(rows.I.dist === 0, "I: only action posted counts", rows.I);
const miss = one("SELECT missing_transitions m FROM v_prd_funnel_health").m;
ok(miss === 5, "health view counts B, C, D, E and I once each (papers, not fields) and not A, F or the young G", miss);
ok(rows.G.dep === 0 && rows.G.pg === 0 && rows.G.dist === 0, "G has no evidence yet but is younger than 120 minutes, so the age gate keeps it out of the count", rows.G);

// stage view: still has the four stages and the limitation text now names NOZ-DOI-1
const stages = all("SELECT stage, value, limitation FROM v_prd_funnel_publication_stages");
ok(stages.map((s) => s.stage).join(",") === "publication,deposit,page,distribution", "stage view keeps the four stages in order", stages.map((s) => s.stage));
ok(/NOZ-DOI-1/.test(stages[1].limitation) && /post_id/.test(stages[3].limitation), "deposit and distribution limitations state the in-house model", stages);
ok(stages[0].value === 8 && stages[1].value === 6 && stages[2].value === 6 && stages[3].value === 2, "stage counts: 8 publications, 6 with deposit evidence (all but D and G, which have no entity_map row), 6 with a page, 2 with distribution (A and F)", stages.map((s) => s.value));

// metric text and the cadence row
const mm = one("SELECT formula f FROM metric_registry WHERE metric = 'prd_funnel_missing_transitions'").f;
ok(/NOZ-DOI-1/.test(mm) && /older than 120 minutes/.test(mm) && /count papers, not missing fields/.test(mm), "metric formula text states the in-house evidence and keeps the 120 minute and per-paper rules", mm);
ok(one("SELECT formula f FROM metric_registry WHERE metric = 'other_metric'").f === "untouched", "another metric is untouched");
const sla = Object.fromEntries(all("SELECT surface, interval_min i, sla_min s, schedule sc FROM cadence_sla").map((r) => [r.surface, r]));
ok(sla.social.i === 1440 && sla.social.s === 120, "social: interval 1440, SLA after due stays 120", sla.social);
ok(/attention_channel_share/.test(sla.social.sc) && /CADENCE-SOCIAL-SHARES-1/.test(sla.social.sc), "social schedule text records the cap and share evidence", sla.social.sc);
ok(sla["q08.org"].i === 120 && sla["papers.qnfo.org"].i === 120, "q08.org and papers.qnfo.org keep interval 120: their gaps are real stalls", sla);

// decision log: written once, idempotent on a second apply, and nothing else changes
ok(one("SELECT COUNT(*) n FROM decision_log").n === 1, "one decision_log row written");
d.exec(sql);
ok(one("SELECT COUNT(*) n FROM decision_log").n === 1, "a second apply writes no second decision_log row");
ok(one("SELECT interval_min i FROM cadence_sla WHERE surface = 'social'").i === 1440, "a second apply leaves the social interval at 1440");
ok(Object.keys(Object.fromEntries(all("SELECT id FROM v_prd_funnel_publications").map((r) => [r.id, 1]))).length === 8, "a second apply leaves the view intact");
ok(one("SELECT COUNT(*) n FROM bak_prd_funnel_view_20261027").n >= 2, "the backup table holds the old view texts", one("SELECT COUNT(*) n FROM bak_prd_funnel_view_20261027"));

// the Rollback line restores the 120 minute interval and the old view (execute it for real)
const rb = header("Rollback");
const stmts = rb.replace(/\(the old stage-view[^)]*\)\s*$/, "").split(/;\s+(?=DROP|CREATE|UPDATE)/).map((s) => s.trim().replace(/;$/, "")).filter(Boolean);
for (const s of stmts) d.exec(s);
ok(one("SELECT interval_min i FROM cadence_sla WHERE surface = 'social'").i === 120, "Rollback restores the 120 minute social interval");
const old = one("SELECT sql s FROM sqlite_master WHERE name = 'v_prd_funnel_publications'").s;
ok(!/dissemination_tracker/.test(old) && /p\.paper_doi=COALESCE/.test(old), "Rollback restores the DOI-only view", old.slice(0, 200));

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
