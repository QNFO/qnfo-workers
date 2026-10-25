// LEARNER-ARMS-2 offline suite (qnfo-social 0.18.0, agent_issues 2722, pillar reach). On 2026-10-19 124 of 137 social_learner_posts rows
// read status 'not-arm' (the attention learner cannot learn from them). Two causes: learnerTopicOf named a topic for three keyword lists
// only, and the channel-drain insert stored link_slug null. This suite drives the real worker.js against in-memory SQLite D1 shims with
// the production schemas and proves: the four papers the issue names (decoherence, functoriality, braid-group, thermodynamic-budgeting)
// never classify to null (the paper's own shelf from living-paper paper_category names the arm; the generic arm research takes a paper with
// no shelf row, no binding or an unreadable one); pillar 4, q08, roll-ups and posts that link no paper stay not-arm; the channel drain
// files a paper slug as link_slug and classifies a channel post whose thread row is gone; the utm join reads a curated thread's clicks
// (campaign = thread slug) and a slug longer than 64 characters (the gateway cuts the campaign); a re-filed row is credited on utm clicks;
// migrations/2026-10-19-learner-arms-backfill.sql re-files the recoverable rows, writes the reason on the rest, keeps a backup, agrees row
// by row with the worker's classifier, is undone by its own Rollback line, and its closing probe reads 1 on the filed state.
// Run: node qnfo-social/learner-arms.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const mod = await import("./worker.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const text = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const src = text("./worker.js");

function shim(conn) {
  const stmtOn = (sql) => {
    let args = [];
    const exec = () => /^\s*(SELECT|WITH)\b/i.test(sql) ? { results: conn.prepare(sql).all(...args) } : (() => { const r = conn.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; })();
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
      async all() { return { results: conn.prepare(sql).all(...args) }; },
      async first() { return conn.prepare(sql).get(...args) || null; },
      async run() { const r = conn.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      _exec: exec
    };
    return s;
  };
  return { prepare: (sql) => stmtOn(sql), async batch(list) { return list.map((s) => s._exec()); } };
}

// The four papers the issue names, with titles as the pipeline writes them (the slug is the title cut to 80 characters).
const PAPERS = [
  { key: "decoherence", slug: "decoherence-as-the-ultimate-consequence-of-linear-accumulation", title: "Decoherence as the Ultimate Consequence of Linear Accumulation", shelf: "physics", topic: "physics" },
  { key: "functoriality", slug: "functoriality-as-a-transform-register-and-gate-cost-analysis-of-a-langlands-stru", title: "Functoriality as a Transform: Register and Gate-Cost Analysis of a Langlands-Structured Quantum Register", shelf: "mathematics", topic: "mathematics" },
  { key: "braid-group", slug: "braid-group-representations-modular-data-and-the-classification-of-majorana-zero", title: "Braid Group Representations, Modular Data, and the Classification of Majorana Zero Modes", shelf: "physics", topic: "physics" },
  { key: "thermodynamic-budgeting", slug: "thermodynamic-budgeting-for-hybrid-quantum-classical-computing-a-three-layer-ene", title: "Thermodynamic Budgeting for Hybrid Quantum-Classical Computing: A Three-Layer Energy Ledger", shelf: "energy", topic: "energy" }
];
// The real title of the functoriality paper carries "Adelic": pillar 4 (STRATEGY 2.3) stays out of the learner arms.
const FUNCT_ADELIC = "Functoriality as a Transform: Register and Gate-Cost Analysis of a Langlands-Structured Adelic Quantum Register";
const paperUrl = (slug) => "https://papers.qnfo.org/papers/" + slug + "/";
const dissemRow = (p) => ({ id: "res-" + p.key, paper_slug: p.slug, paper_doi: null, paper_title: p.title, pages_url: paperUrl(p.slug) });

// ---------- 1. Classification: no post that links a paper is stored without an arm ----------
for (const p of PAPERS) {
  const none = mod.learnerClassify(dissemRow(p), "dissem");
  ok(none.topic === mod.LEARNER_GENERIC_TOPIC && none.link_slug === p.slug && none.slug === p.slug, p.key + ": a dissemination card with no shelf row takes the generic arm (never null), link_slug = the paper slug");
  const shelf = mod.learnerClassify(dissemRow(p), "dissem", { categories: { [p.slug]: p.shelf } });
  ok(shelf.topic === p.topic, p.key + ": the paper's own shelf (" + p.shelf + ") names the arm " + p.topic + " (got " + shelf.topic + ")");
  const th = mod.learnerClassify({ slug: p.key + "-thread", title: p.title, posts: JSON.stringify([p.title + " https://papers.qnfo.org/papers/" + p.slug]) }, "thread", { categories: { [p.slug]: p.shelf } });
  ok(th.topic === p.topic && th.link_slug === p.slug, p.key + ": a thread whose post links the paper reads the shelf of the linked slug");
  const preview = (p.title + " — https://papers.qnfo.org/papers/" + p.slug + "/?utm_source=mastodon&utm_medium=social&utm_campaign=" + p.slug).slice(0, 200);
  const ch = mod.learnerClassifyChannel({ project_id: p.slug, content_preview: preview, is_paper: 1 }, { categories: { [p.slug]: p.shelf } });
  ok(ch.topic === p.topic && ch.slug === p.slug && ch.format === "single", p.key + ": a channel post with no thread row (project_id = the campaign slug) takes the same arm");
  ok(mod.learnerClassifyChannel({ project_id: p.slug, content_preview: preview, is_paper: 1 }).link_slug === p.slug, p.key + ": the channel row's link_slug is the paper slug");
  ok(mod.LEARNER_TOPICS.includes(none.topic) && mod.LEARNER_TOPICS.includes(shelf.topic), p.key + ": both arms are in the posterior's vocabulary (a topic outside it would be dropped at credit)");
}
ok(Object.values(mod.LEARNER_CATEGORY_TOPIC).every((t) => mod.LEARNER_TOPICS.includes(t)) && mod.LEARNER_TOPICS.includes(mod.LEARNER_GENERIC_TOPIC) && ["energy", "epistemics", "operations"].every((t) => mod.LEARNER_TOPICS.includes(t)), "every shelf arm and the generic arm are in LEARNER_TOPICS, and the three older arm names are kept");
ok(mod.learnerClassify(dissemRow(PAPERS[0]), "dissem", { categories: { [PAPERS[0].slug]: "a-shelf-added-later" } }).topic === "research", "a shelf the learner does not know yet is the generic arm, not null");
// the keyword pillars still come first: a selected energy paper stays on the energy arm whatever its shelf says
ok(mod.learnerClassify({ id: "k", paper_slug: "llm", paper_title: "Joules-per-Solution for Stochastic and Agentic Inference", pages_url: paperUrl("llm") }, "dissem", { categories: { llm: "ai-operations" } }).topic === "energy", "a keyword pillar wins over the shelf");
ok(mod.learnerClassify(dissemRow(PAPERS[0]), "dissem", { categories: { [PAPERS[0].slug]: "ai-epistemics" } }).topic === "epistemics" && mod.learnerClassify(dissemRow(PAPERS[0]), "dissem", { categories: { [PAPERS[0].slug]: "ai-operations" } }).topic === "operations", "ai-epistemics and ai-operations keep the older arm names epistemics and operations");

// what stays out
const adelic = mod.learnerClassify({ id: "a", paper_slug: "functoriality-adelic", paper_title: FUNCT_ADELIC, pages_url: paperUrl("functoriality-adelic") }, "dissem", { categories: { "functoriality-adelic": "mathematics" } });
ok(adelic.topic === null && adelic.link_slug === "functoriality-adelic" && adelic.not_arm_reason === "pillar 4", "pillar 4 (the real functoriality title carries 'Adelic') stays out of the arms even with a shelf, and still names its paper link with an exclusion reason");
ok(mod.learnerClassify({ id: "q", paper_slug: "p", paper_title: "An essay", pages_url: "https://q08.org/p/2026-10-01-x" }, "dissem").topic === null && mod.learnerClassify({ id: "q", paper_slug: "p", paper_title: "An essay", pages_url: "https://q08.org/p/2026-10-01-x" }, "dissem").not_arm_reason === "q08 link", "a q08 link is never an arm and carries an exclusion reason");
ok(mod.learnerClassify({ id: "r", paper_slug: "rollup-2026-10-18T11:30", paper_title: "Roll-up", pages_url: "" }, "dissem").topic === null && mod.learnerClassify({ slug: "rollup-2026-10-18T11:30", title: "x", posts: JSON.stringify(["https://papers.qnfo.org/papers/a"]) }, "thread").topic === null, "a roll-up carries several papers: no single arm");
const roll = mod.learnerClassifyChannel({ project_id: "rollup-2026-10-18T11:30", content_preview: "Papers this hour: https://papers.qnfo.org/papers/a https://papers.qnfo.org/papers/b", is_paper: 0 });
ok(roll.topic === null && roll.link_slug === null && roll.slug === "rollup-2026-10-18T11:30", "a roll-up channel post has no link and no arm");
const ipat = mod.learnerClassifyChannel({ project_id: "ipatent-example", content_preview: "Claim: an AI-drafted provisional only protects what its description supports.\nStatus: free tool, not legal advice", is_paper: 0 }, { categories: {} });
ok(ipat.topic === null && ipat.link_slug === null, "a post that links no paper (the iPatent example) has no paper link and no arm");
ok(mod.learnerClassify({ slug: "ipatent-example", title: "A real AI-drafted provisional", posts: JSON.stringify(["Claim: an AI-drafted provisional only protects what its description supports. https://ipatent.qnfo.org/example"]) }, "thread").topic === null, "a thread whose post links no papers.qnfo.org page and names no pillar is not an arm");
ok(mod.learnerClassifyChannel({ project_id: "x", content_preview: "An essay https://q08.org/p/a", is_paper: 1 }).topic === null && mod.learnerClassifyChannel({ project_id: "x", content_preview: "An essay https://q08.org/p/a", is_paper: 1 }).not_arm_reason === "q08 link", "a q08 channel post is never an arm and carries an exclusion reason");
ok(mod.learnerClassifyChannel({ project_id: PAPERS[1].slug, content_preview: (PAPERS[1].title + " \u2014 https://papers.qnfo.org/papers/" + PAPERS[1].slug + "/?utm_source=x").slice(0, 200), is_paper: 0 }).link_slug === PAPERS[1].slug && mod.learnerClassifyChannel({ project_id: PAPERS[1].slug, content_preview: (PAPERS[1].title + " \u2014 new open-access paper: https://papers.qnfo.org/papers/" + PAPERS[1].slug).slice(0, 170), is_paper: 0 }).link_slug === PAPERS[1].slug, "a preview cut inside the slug (200 characters) still yields the whole slug when the project_id continues it");
ok(mod.learnerClassifyChannel({ project_id: "orphan-paper", content_preview: "Orphan Paper — https://papers.qnfo.org/papers/orphan-paper/?utm_source=x", is_paper: 0 }).link_slug === "orphan-paper", "a paper link in the posted text is enough to name the paper (no dissemination row needed)");

// ---------- 2. learnerCategories: one fail-soft read of living-paper paper_category ----------
const lp = new DatabaseSync(":memory:");
lp.exec("CREATE TABLE paper_category (slug TEXT PRIMARY KEY, category TEXT NOT NULL, secondary TEXT NOT NULL DEFAULT '[]', confidence INTEGER, method TEXT NOT NULL DEFAULT 'classifier', why TEXT, updated_at TEXT)");
for (const p of PAPERS) lp.prepare("INSERT INTO paper_category (slug, category) VALUES (?, ?)").run(p.slug, p.shelf);
for (let i = 0; i < 130; i++) lp.prepare("INSERT INTO paper_category (slug, category) VALUES (?, 'physics')").run("filler-" + i);
const LIVING = shim(lp);
let cats = await mod.learnerCategories({ LIVING_PAPER: LIVING }, PAPERS.map((p) => p.slug).concat(["no-such-paper", null, ""]));
ok(PAPERS.every((p) => cats[p.slug] === p.shelf) && cats["no-such-paper"] === undefined, "learnerCategories returns the shelf of each known slug and nothing for an unknown one");
cats = await mod.learnerCategories({ LIVING_PAPER: LIVING }, Array.from({ length: 130 }, (_, i) => "filler-" + i));
ok(Object.keys(cats).length === 130, "more than 90 slugs are read in several queries (D1 allows 100 bound values)");
ok(JSON.stringify(await mod.learnerCategories({}, ["a"])) === "{}" && JSON.stringify(await mod.learnerCategories(null, ["a"])) === "{}", "no LIVING_PAPER binding: no shelves, no throw");
ok(JSON.stringify(await mod.learnerCategories({ LIVING_PAPER: { prepare() { throw new Error("D1 down"); } } }, ["a"])) === "{}", "an unreadable shelf table: no shelves, no throw (the generic arm follows)");
ok(JSON.stringify(await mod.learnerCategories({ LIVING_PAPER: LIVING }, [])) === "{}", "no slugs, no read");

// ---------- 3. learnerDiscover: the channel drain files a paper slug and an arm ----------
function fixture() {
  const conn = new DatabaseSync(":memory:");
  conn.exec(`CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT DEFAULT 'queued', posted_at TEXT, created_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0, error TEXT, doi TEXT, abstract TEXT, flags TEXT, notes TEXT, updated_at TEXT, post_uri TEXT);
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT NOT NULL, paper_doi TEXT, paper_title TEXT, channel TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'posted', post_url TEXT, post_id TEXT, post_text_snippet TEXT, mode TEXT, fallback INTEGER DEFAULT 0, posted_at TEXT, pages_url TEXT, github_url TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0);
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT, status TEXT DEFAULT 'published', engagement_metrics TEXT, created_at TEXT DEFAULT (datetime('now')), _version INTEGER DEFAULT 1);
CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));
CREATE TABLE social_engagements (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, post_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL DEFAULT 0, note TEXT, collected_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(platform, post_id, metric, collected_at));
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));`);
  return conn;
}
const NOW = Date.now();
const sqlTs = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);
const isoTs = (ms) => new Date(ms).toISOString();
const DAY = 864e5;
function seed(conn) {
  PAPERS.forEach((p, i) => {
    conn.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_title, channel, action, post_id, posted_at, pages_url) VALUES (?, ?, ?, 'bluesky', 'posted', ?, ?, ?)").run("res-" + p.key, p.slug, p.title, "at://did:plc:me/app.bsky.feed.post/" + p.key, isoTs(NOW - (2 + i) * DAY), paperUrl(p.slug));
    const prev = (p.title + " — https://papers.qnfo.org/papers/" + p.slug + "/?utm_source=mastodon&utm_medium=social&utm_campaign=" + p.slug).slice(0, 200);
    conn.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, content_preview, published_at, status) VALUES (?, 'buffer-mastodon', ?, ?, ?, ?, ?, 'published')").run("ch-mastodon-" + p.key, "m" + p.key, "buf-" + p.key, p.slug, prev, sqlTs(NOW - (1 + i) * DAY));
  });
  // pillar 4: the real functoriality title, on Bluesky and on a channel
  conn.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_title, channel, action, post_id, posted_at, pages_url) VALUES ('res-adelic', 'functoriality-adelic', ?, 'bluesky', 'posted', 'at://did:plc:me/app.bsky.feed.post/adelic', ?, ?)").run(FUNCT_ADELIC, isoTs(NOW - 2 * DAY), paperUrl("functoriality-adelic"));
  conn.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, content_preview, published_at, status) VALUES ('ch-x-adelic', 'buffer-x', 'xa', 'buf-adelic', 'functoriality-adelic', ?, ?, 'published')").run((FUNCT_ADELIC + " — https://papers.qnfo.org/papers/functoriality-adelic/?utm_source=x").slice(0, 200), sqlTs(NOW - 2 * DAY));
  // a roll-up (several papers) and the iPatent example thread (links no paper)
  conn.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, content_preview, published_at, status) VALUES ('ch-substack-roll', 'buffer-substack', 'sr', 'buf-roll', 'rollup-2026-10-18T11:30', 'Papers this hour: https://papers.qnfo.org/papers/a https://papers.qnfo.org/papers/b', ?, 'published')").run(sqlTs(NOW - 1 * DAY));
  conn.prepare("INSERT INTO social_threads (slug, title, posts, status) VALUES ('ipatent-example', 'A real AI-drafted provisional, and what it got wrong', ?, 'posted')").run(JSON.stringify(["Claim: an AI-drafted provisional only protects what its description supports.\nStatus: free tool, not legal advice. https://ipatent.qnfo.org/example"]));
  conn.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, content_preview, published_at, status) VALUES ('ch-linkedin-ipat', 'buffer-linkedin', 'li', 'buf-ipat', 'ipatent-example', 'Claim: an AI-drafted provisional only protects what its description supports.', ?, 'published')").run(sqlTs(NOW - 1 * DAY));
  // a curated thread whose slug differs from the paper slug it links (jps-metric -> joules-per-solution-metric)
  conn.prepare("INSERT INTO social_threads (slug, title, posts, status) VALUES ('jps-metric', 'The Joules-per-Solution Metric', ?, 'posted')").run(JSON.stringify(["Claim: one energy benchmark across domains: joules per correct answer.\nhttps://papers.qnfo.org/papers/joules-per-solution-metric"]));
  conn.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, content_preview, published_at, status) VALUES ('ch-mastodon-jps', 'buffer-mastodon', 'mj', 'buf-jps', 'jps-metric', 'Claim: one energy benchmark', ?, 'published')").run(sqlTs(NOW - 3 * DAY));
  // a paper only the posted text names (no dissemination row, no thread row)
  conn.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, content_preview, published_at, status) VALUES ('ch-linkedin-orphan', 'buffer-linkedin', 'lo', 'buf-orphan', 'orphan-paper', ?, ?, 'published')").run("Orphan Paper — new open-access paper: https://papers.qnfo.org/papers/orphan-paper/?utm_source=linkedin", sqlTs(NOW - 1 * DAY));
}
async function discover(withShelves) {
  const conn = fixture();
  seed(conn);
  const env = { DB: shim(conn), AI: {} };
  if (withShelves) env.LIVING_PAPER = LIVING;
  await mod.ensureLearnerSchema(env);
  const n = await mod.learnerDiscover(env, NOW);
  const rows = (k) => conn.prepare("SELECT * FROM social_learner_posts WHERE post_key = ?").get(k);
  return { conn, env, n, rows };
}
let D = await discover(true);
ok(D.n === 5 + 9 && D.conn.prepare("SELECT COUNT(*) n FROM social_learner_posts").get().n === 14, "discover files the five Bluesky dissemination posts and the nine channel posts (got " + D.n + ")");
for (const p of PAPERS) {
  const b = D.rows("dissem:res-" + p.key), c = D.rows("channel:ch-mastodon-" + p.key);
  ok(b.topic === p.topic && b.status === "pending" && b.link_slug === p.slug, p.key + ": the Bluesky row is pending on its shelf arm " + p.topic + " with its link slug");
  ok(c.topic === p.topic && c.status === "pending" && c.link_slug === p.slug && c.channel === "mastodon" && c.slug === p.slug && c.chosen_by === "channel-drain", p.key + ": the channel row is pending on the same arm with link_slug = the paper slug (it was null)");
}
const notArm = D.conn.prepare("SELECT post_key FROM social_learner_posts WHERE status = 'not-arm' ORDER BY post_key").all().map((r) => r.post_key);
ok(JSON.stringify(notArm) === JSON.stringify(["channel:ch-linkedin-ipat", "channel:ch-substack-roll", "channel:ch-x-adelic", "dissem:res-adelic"]), "only the roll-up, the iPatent post and the two pillar-4 posts stay not-arm: " + notArm.join(","));
ok(D.rows("channel:ch-substack-roll").link_slug === null && D.rows("channel:ch-substack-roll").topic === null, "the roll-up row carries no link and no arm (several papers)");
ok(D.rows("channel:ch-linkedin-ipat").link_slug === null && D.rows("channel:ch-linkedin-ipat").topic === null, "the iPatent row links no paper: no link, no arm");
ok(D.rows("channel:ch-x-adelic").link_slug === "functoriality-adelic" && D.rows("dissem:res-adelic").link_slug === "functoriality-adelic", "a pillar-4 post still names the paper it links (it is a paper-link post that stays not-arm by policy)");
ok(JSON.parse(D.rows("channel:ch-x-adelic").reward_detail).not_arm === "pillar 4" && JSON.parse(D.rows("dissem:res-adelic").reward_detail).not_arm === "pillar 4", "discovered pillar-4 channel and Bluesky rows persist the intentional exclusion reason");
const jps = D.rows("channel:ch-mastodon-jps");
ok(jps.slug === "jps-metric" && jps.link_slug === "joules-per-solution-metric" && jps.topic === "energy" && jps.status === "pending", "a curated thread's channel post: slug = the campaign (thread slug), link_slug = the paper it links, energy arm");
const orph = D.rows("channel:ch-linkedin-orphan");
ok(orph.link_slug === "orphan-paper" && orph.topic === "research" && orph.status === "pending", "a paper only the posted text names: link_slug from the text, the generic arm (no shelf row)");
ok(D.conn.prepare("SELECT COUNT(*) n FROM social_learner_posts WHERE link_slug IS NOT NULL AND topic IS NULL AND post_key NOT IN ('channel:ch-x-adelic', 'dissem:res-adelic')").get().n === 0, "no row that links a paper and is not pillar 4 or q08 has a null topic");
// the closing probe, taken from the migration file, reads 1 on this state
const mig = text("../migrations/2026-10-19-learner-arms-backfill.sql");
const probeM = /^UPDATE remediation_contracts SET verify_probe = '((?:[^']|'')*)'/m.exec(mig);
const PROBE = probeM ? probeM[1].replace(/''/g, "'") : "";
const probeRun = (conn) => conn.prepare(PROBE).get();
ok(PROBE.startsWith("SELECT '1' AS expected") && probeRun(D.conn).expected === "1" && probeRun(D.conn).observed === "1", "the closing probe of issue 2722 reads observed 1 on the filed state (2 pillar-4 rows of 12 paper-link posts): " + JSON.stringify(probeRun(D.conn)));
D.conn.exec("UPDATE social_learner_posts SET status = 'not-arm', topic = NULL WHERE channel = 'bluesky'");
ok(probeRun(D.conn).observed === "0", "the same probe reads 0 when the paper-link posts are not-arm again (the defect state)");
// with no shelf binding every paper post still takes an arm
D = await discover(false);
ok(PAPERS.every((p) => D.rows("dissem:res-" + p.key).topic === "research" && D.rows("channel:ch-mastodon-" + p.key).topic === "research") && D.rows("channel:ch-mastodon-jps").topic === "energy", "without the LIVING_PAPER binding the four papers take the generic arm and the keyword pillar still wins");
ok(D.conn.prepare("SELECT COUNT(*) n FROM social_learner_posts WHERE status = 'not-arm'").get().n === 4, "the same four rows stay not-arm without the binding");
const again = await mod.learnerDiscover(D.env, NOW);
ok(again === 0, "a second discover files nothing again");

// ---------- 4. The utm join: the campaign key and the row slug ----------
const gw = text("../qnfo-gateway/worker.js");
ok(gw.includes('String(v || "").toLowerCase().trim().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64)') && src.includes("String(v || '').toLowerCase().trim().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)"), "learnerUtmCampaign is the gateway's utmClean (same chain of calls: parity guard)");
ok(mod.learnerUtmCampaign("Foo Bar/baz_1") === "foo-bar-baz_1" && mod.learnerUtmCampaign(PAPERS[1].slug).length === 64 && mod.learnerUtmCampaign(PAPERS[1].slug) === PAPERS[1].slug.slice(0, 64), "a slug is lower-cased, cleaned and cut to 64 characters (the cut comes last, as in the gateway)");
const V = fixture();
const venv = { DB: shim(V), AI: {} };
await mod.ensureLearnerSchema(venv);
const d0 = isoTs(NOW - 5 * DAY).slice(0, 10);
V.prepare("INSERT INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES (?, 'utm', 'mastodon', 'campaign', 'jps-metric', 'clicks_human', 6, 'human')").run(d0);
V.prepare("INSERT INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES (?, 'utm', 'bluesky', 'campaign', ?, 'clicks_human', 4, 'human')").run(d0, PAPERS[1].slug.slice(0, 64));
let vz = await mod.learnerVisits(venv, "joules-per-solution-metric", d0, "mastodon");
ok(vz.source !== "utm", "by the paper slug alone the curated thread's clicks are not found (the 0.17 behaviour: they read as no visits)");
vz = await mod.learnerVisits(venv, "joules-per-solution-metric", d0, "mastodon", "jps-metric");
ok(vz.source === "utm" && vz.visits === 6 && vz.channel === "mastodon", "with the row's slug as the campaign the curated thread's 6 human clicks are read: " + JSON.stringify(vz));
vz = await mod.learnerVisits(venv, PAPERS[1].slug, d0, "bluesky", PAPERS[1].slug);
ok(vz.source === "utm" && vz.visits === 4, "an 80-character slug reads the clicks the gateway stored under its 64-character campaign: " + JSON.stringify(vz));
vz = await mod.learnerVisits(venv, "joules-per-solution-metric", d0, "bluesky", "jps-metric");
ok(vz.source !== "utm", "the clicks of another channel are not borrowed (the utm_source still filters)");

// a re-filed channel row is credited on the utm clicks (UTM-CREDIT-1 reaches the rows this change files)
V.prepare("INSERT INTO social_learner_posts (post_key, slug, bsky_uri, link_slug, topic, format, slot, n_posts, posted_at, chosen_by, status, created_at, channel, buffer_id) VALUES ('channel:ch-mastodon-jps', 'jps-metric', NULL, 'joules-per-solution-metric', 'energy', 'single', 'us-morning', 1, ?, 'channel-drain', 'pending', ?, 'mastodon', 'buf-jps')").run(isoTs(NOW - 5 * DAY), isoTs(NOW));
V.prepare("INSERT INTO social_learner_posts (post_key, slug, bsky_uri, link_slug, topic, format, slot, n_posts, posted_at, chosen_by, status, created_at, channel) VALUES ('dissem:res-long', ?, 'at://did:plc:me/app.bsky.feed.post/long', ?, 'research', 'single', 'us-morning', 1, ?, 'scheduler', 'pending', ?, 'bluesky')").run(PAPERS[1].slug, PAPERS[1].slug, isoTs(NOW - 5 * DAY), isoTs(NOW));
const credit = { credited: 0, no_data: 0, waiting: 0, rewards: [] };
await mod.learnerCreditPending(venv, NOW, credit);
const cj = V.prepare("SELECT status, visits, reward, reward_detail FROM social_learner_posts WHERE post_key = 'channel:ch-mastodon-jps'").get();
ok(credit.credited === 2 && cj.status === "credited" && cj.visits === 6 && cj.reward > 0 && /"source":"utm"/.test(cj.reward_detail), "the re-filed curated-thread channel row is credited on its utm clicks: " + JSON.stringify(cj));
const cl = V.prepare("SELECT status, visits, reward_detail FROM social_learner_posts WHERE post_key = 'dissem:res-long'").get();
ok(cl.status === "credited" && cl.visits === 4 && /"source":"utm"/.test(cl.reward_detail), "the 80-character-slug Bluesky row is credited on its utm clicks");
const post = await mod.learnerPosterior(venv);
ok(post.topic.energy.n === 1 && post.topic.research.n === 1 && post.topic.research.a > 1, "the credited rows move their own topic arms (energy, research): the generic arm is in the posterior");

// ---------- 5. The decision draws over every arm ----------
const cands = [
  { source: "dissem", id: "a", arms: { topic: "physics", format: "single", slug: "a" } },
  { source: "dissem", id: "b", arms: { topic: "research", format: "single", slug: "b" } },
  { source: "dissem", id: "c", arms: { topic: null, format: "single", slug: "c" } }
];
const prior = mod.learnerPrior();
ok(Object.keys(prior.topic).length === mod.LEARNER_TOPICS.length && mod.LEARNER_TOPICS.length === 10, "the prior carries ten topic arms (three pillars, six shelves, the generic arm)");
let pickedNull = 0, pickedPhysics = 0, pickedResearch = 0;
for (let k = 0; k < 200; k++) { const x = mod.learnerChoose(cands, prior, (() => { let a = 1000 + k; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; }; })(), NOW); if (x.id === "c") pickedNull++; if (x.id === "a") pickedPhysics++; if (x.id === "b") pickedResearch++; }
ok(pickedNull === 0 && pickedPhysics > 40 && pickedResearch > 40, "the learner now chooses among paper posts by arm (physics " + pickedPhysics + ", research " + pickedResearch + ") and never prefers the not-arm one");

// ---------- 6. migrations/2026-10-19-learner-arms-backfill.sql on production-shaped rows ----------
const head = mig.split("\n").slice(0, 40).join("\n");
ok(/^-- APPLY-BY: ci$/m.test(head) && /^-- DB: qnfo-audit$/m.test(head) && /^-- BACKUP: bak_20261019_learner_arms$/m.test(head) && /^-- Rollback: .+/m.test(head), "the migration carries APPLY-BY, DB, BACKUP and Rollback header lines");
function prodDb() {
  const c = new DatabaseSync(":memory:");
  c.exec(`CREATE TABLE social_learner_posts (post_key TEXT PRIMARY KEY, slug TEXT, bsky_uri TEXT, link_slug TEXT, topic TEXT, format TEXT, slot TEXT, n_posts INTEGER, posted_at TEXT, chosen_by TEXT, decision TEXT, status TEXT, engagement REAL, visits REAL, reward REAL, reward_detail TEXT, credited_at TEXT, created_at TEXT, channel TEXT, buffer_id TEXT);
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT NOT NULL, paper_doi TEXT, paper_title TEXT, channel TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'posted', post_url TEXT, post_id TEXT, post_text_snippet TEXT, mode TEXT, fallback INTEGER DEFAULT 0, posted_at TEXT, pages_url TEXT, github_url TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT DEFAULT 'queued', claimed_at TEXT, completed_at TEXT, paper_slug TEXT, created_at TEXT, stage TEXT, agent_task_id TEXT, attempt INTEGER DEFAULT 0, revise_count INTEGER DEFAULT 0, context TEXT, published_at TEXT, doi TEXT, paper_url TEXT, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0, publish_due_at TEXT, UNIQUE(source, source_id));
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT, status TEXT DEFAULT 'published', engagement_metrics TEXT, created_at TEXT DEFAULT (datetime('now')), _version INTEGER DEFAULT 1);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);`);
  return c;
}
const OLD_PROBE = "SELECT '1' AS expected, CASE WHEN (SELECT COUNT(*) FROM social_learner_posts WHERE status IN ('credited','pending') AND chosen_by <> 'learner') >= 20 THEN '1' ELSE '0' END AS observed";
const P = prodDb();
const addL = (key, slug, o) => P.prepare("INSERT INTO social_learner_posts (post_key, slug, bsky_uri, link_slug, topic, format, slot, n_posts, posted_at, chosen_by, status, created_at, channel, buffer_id, reward_detail) VALUES (?, ?, ?, ?, NULL, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)").run(key, slug, o.uri || null, o.link === undefined ? null : o.link, "single", "us-morning", isoTs(NOW - 3 * DAY), o.by || "scheduler", o.status || "not-arm", isoTs(NOW), o.ch, o.buf || null, o.rd || null);
const rows0 = [];
for (const p of PAPERS) {
  P.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_title, channel, action, post_id, posted_at, pages_url) VALUES (?, ?, ?, 'bluesky', 'posted', ?, ?, ?)").run("res-" + p.key, p.slug, p.title, "at://x/" + p.key, isoTs(NOW - 3 * DAY), paperUrl(p.slug));
  addL("dissem:res-" + p.key, p.slug, { link: p.slug, ch: "bluesky", uri: "at://x/" + p.key });
  rows0.push({ key: "dissem:res-" + p.key, js: mod.learnerClassify(dissemRow(p), "dissem") });
  const prev = (p.title + " — https://papers.qnfo.org/papers/" + p.slug + "/?utm_source=x").slice(0, 200);
  P.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, content_preview, published_at) VALUES (?, 'buffer-x', 'x', 'b', ?, ?, ?)").run("ch-x-" + p.key, p.slug, prev, sqlTs(NOW - 3 * DAY));
  addL("channel:ch-x-" + p.key, p.slug, { ch: "x", by: "channel-drain", buf: "b" });
  rows0.push({ key: "channel:ch-x-" + p.key, js: mod.learnerClassifyChannel({ project_id: p.slug, content_preview: prev, is_paper: 1 }) });
}
// pillar 4 (Bluesky and a channel), a roll-up, the iPatent thread post, a q08 paper post
P.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_title, channel, action, post_id, posted_at, pages_url) VALUES ('res-adelic', 'functoriality-adelic', ?, 'bluesky', 'posted', 'at://x/ad', ?, ?)").run(FUNCT_ADELIC, isoTs(NOW - 3 * DAY), paperUrl("functoriality-adelic"));
addL("dissem:res-adelic", "functoriality-adelic", { link: "functoriality-adelic", ch: "bluesky", uri: "at://x/ad" });
rows0.push({ key: "dissem:res-adelic", js: mod.learnerClassify({ id: "res-adelic", paper_slug: "functoriality-adelic", paper_title: FUNCT_ADELIC, pages_url: paperUrl("functoriality-adelic") }, "dissem") });
const adPrev = (FUNCT_ADELIC + " — https://papers.qnfo.org/papers/functoriality-adelic/?utm_source=x").slice(0, 200);
P.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, content_preview, published_at) VALUES ('ch-x-adelic', 'buffer-x', 'x', 'b', 'functoriality-adelic', ?, ?)").run(adPrev, sqlTs(NOW - 3 * DAY));
addL("channel:ch-x-adelic", "functoriality-adelic", { ch: "x", by: "channel-drain", buf: "b" });
rows0.push({ key: "channel:ch-x-adelic", js: mod.learnerClassifyChannel({ project_id: "functoriality-adelic", content_preview: adPrev, is_paper: 1 }) });
P.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, content_preview, published_at) VALUES ('ch-substack-r1', 'buffer-substack', 'x', 'b', 'rollup-2026-10-18T11:30', 'Papers this hour: https://papers.qnfo.org/papers/a', ?)").run(sqlTs(NOW - 3 * DAY));
addL("channel:ch-substack-r1", "rollup-2026-10-18T11:30", { ch: "substack", by: "channel-drain", buf: "b" });
rows0.push({ key: "channel:ch-substack-r1", js: mod.learnerClassifyChannel({ project_id: "rollup-2026-10-18T11:30", content_preview: "Papers this hour", is_paper: 0 }) });
P.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, content_preview, published_at) VALUES ('ch-x-ipat', 'buffer-x', 'x', 'b', 'ipatent-example', 'Claim: an AI-drafted provisional only protects what its description supports.', ?)").run(sqlTs(NOW - 3 * DAY));
addL("channel:ch-x-ipat", "ipatent-example", { ch: "x", by: "channel-drain", buf: "b" });
rows0.push({ key: "channel:ch-x-ipat", js: mod.learnerClassifyChannel({ project_id: "ipatent-example", content_preview: "Claim: an AI-drafted provisional only protects what its description supports.", is_paper: 0 }) });
P.prepare("INSERT INTO research_queue (id, source, source_id, paper_slug, status) VALUES ('rq1', 'proposal', 's1', 'a-q08-paper', 'published')").run();
P.prepare("INSERT INTO social_media_posts (id, platform, post_id, buffer_id, project_id, content_preview, published_at) VALUES ('ch-x-q08', 'buffer-x', 'x', 'b', 'a-q08-paper', 'A vendor essay — https://q08.org/p/2026-10-01-x', ?)").run(sqlTs(NOW - 3 * DAY));
addL("channel:ch-x-q08", "a-q08-paper", { ch: "x", by: "channel-drain", buf: "b" });
rows0.push({ key: "channel:ch-x-q08", js: mod.learnerClassifyChannel({ project_id: "a-q08-paper", content_preview: "A vendor essay — https://q08.org/p/2026-10-01-x", is_paper: 1 }) });
// rows the file must not touch
P.prepare("INSERT INTO social_learner_posts (post_key, slug, link_slug, topic, status, posted_at, channel, chosen_by, reward) VALUES ('thread:149', 'jps-metric', 'joules-per-solution-metric', 'energy', 'credited', ?, 'bluesky', 'learner', 0.08)").run(isoTs(NOW - 9 * DAY));
P.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to) VALUES ('issue-2722', 2722, 'p', 'a', ?, 'd1-query', 'qnfo-fleet-control')").run(OLD_PROBE);
const snap = () => JSON.stringify(P.prepare("SELECT post_key, link_slug, topic, status, reward_detail FROM social_learner_posts ORDER BY post_key").all());
const before = snap();
P.exec(mig);
const row = (k) => P.prepare("SELECT post_key, slug, link_slug, topic, status, reward_detail FROM social_learner_posts WHERE post_key = ?").get(k);
for (const p of PAPERS) {
  ok(row("dissem:res-" + p.key).status === "pending" && row("dissem:res-" + p.key).topic === "research", p.key + ": the Bluesky row is re-filed as research / pending");
  const c = row("channel:ch-x-" + p.key);
  ok(c.status === "pending" && c.topic === "research" && c.link_slug === p.slug, p.key + ": the channel row gets link_slug = the paper slug and is re-filed as research / pending");
}
ok(row("dissem:res-adelic").status === "not-arm" && row("dissem:res-adelic").topic === null && /pillar 4/.test(row("dissem:res-adelic").reward_detail), "a pillar-4 Bluesky row stays not-arm with its reason");
ok(row("channel:ch-x-adelic").status === "not-arm" && row("channel:ch-x-adelic").link_slug === "functoriality-adelic" && /pillar 4/.test(row("channel:ch-x-adelic").reward_detail), "a pillar-4 channel row names its paper link and stays not-arm with its reason");
ok(row("channel:ch-substack-r1").status === "not-arm" && row("channel:ch-substack-r1").link_slug === null && row("channel:ch-substack-r1").topic === null && /roll-up/.test(row("channel:ch-substack-r1").reward_detail), "a roll-up row stays not-arm with no link and its reason");
ok(row("channel:ch-x-ipat").status === "not-arm" && row("channel:ch-x-ipat").link_slug === null && /links no paper/.test(row("channel:ch-x-ipat").reward_detail), "the iPatent post stays not-arm with no link and its reason");
ok(row("channel:ch-x-q08").status === "not-arm" && /q08 link/.test(row("channel:ch-x-q08").reward_detail), "a q08 paper post stays not-arm with its reason");
ok(row("thread:149").status === "credited" && row("thread:149").topic === "energy", "a credited row is not touched");
let agree = 0;
for (const r of rows0) { const x = row(r.key); if ((x.status === "pending") === (r.js.topic !== null) && (x.status !== "pending" || x.topic === r.js.topic)) agree++; else console.log("DISAGREE " + r.key + " sql=" + x.status + "/" + x.topic + " js=" + r.js.topic); }
ok(agree === rows0.length && rows0.length === 13, "the file and the worker's classifier agree on all " + rows0.length + " rows (pending exactly when the worker names an arm, the same arm)");
const bak = P.prepare("SELECT COUNT(*) n, SUM(status = 'not-arm') s, SUM(topic IS NULL) t FROM bak_20261019_learner_arms").get();
ok(Number(bak.n) === 13 && Number(bak.s) === 13 && Number(bak.t) === 13, "the backup holds the 13 not-arm rows as they stood (the credited row is not in it)");
ok(P.prepare("SELECT COUNT(*) n FROM social_learner_posts WHERE status = 'pending'").get().n === 8, "eight rows are recovered (four papers on Bluesky, four on a channel)");
ok(P.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-2722'").get().verify_probe === PROBE && P.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class = 'fm-learner-topic-null' AND verify_transport = 'd1-query' AND issue_id = 2722").get().n === 1, "issue 2722 gets the closing probe and the fm-learner-topic-null detector carries it");
ok(P.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'learner-topic-null'").get().n === 1 && P.prepare("SELECT predicted_outcome p FROM decision_log").get().p === "learner_paper_link_not_arm_share_7d <= 0.2 within 24 h" && P.prepare("SELECT COUNT(*) n FROM capability_ledger WHERE capability = 'paper-shelf-learner-arms'").get().n === 1, "the failure mode, the decision (with its prediction) and the capability are recorded");
// the file on a state it already changed is a no-op on the rows
const afterOnce = snap();
P.exec(mig);
ok(snap() === afterOnce && Number(P.prepare("SELECT COUNT(*) n FROM bak_20261019_learner_arms").get().n) === 13, "running the file again changes no row and keeps the first backup");
// the Rollback line restores the rows from the backup
const rb = /^-- Rollback: (.+)$/m.exec(mig)[1];
P.exec(rb);
ok(snap() === before, "the Rollback line restores every row to its state before the file (status, topic, link_slug, reward_detail)");
ok(P.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-2722'").get().verify_probe === OLD_PROBE && P.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class = 'fm-learner-topic-null'").get().n === 0 && P.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 0, "and the old probe is back, the detector and the failure mode are gone");

// ---------- 7. Source level: version, mirror, binding ----------
const vm = /var VERSION = "([^"]+)"/.exec(src);
ok(vm && versionAtLeast(vm[1], "0.18.0"), "qnfo-social VERSION is at least 0.18.0 (a minor: the learner takes a decision it did not take): " + (vm && vm[1]));
ok(src === text("./deployed-current.worker.js"), "deployed-current.worker.js is identical to worker.js (mirror guard)");
const toml = text("./wrangler.toml");
ok(/binding = "LIVING_PAPER"\s*\ndatabase_name = "living-paper"\s*\ndatabase_id = "70a58cb3-b2cd-498d-877f-ecca86859a22"/.test(toml), "wrangler.toml declares the LIVING_PAPER binding on the living-paper database (the one qnfo-gateway reads paper_category from)");
ok(!/INSERT INTO paper_category|UPDATE paper_category|DELETE FROM paper_category/i.test(src), "the worker only reads paper_category");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
