// BRAND-PROFILE-SYNC-1 offline suite (qnfo-fleet-dashboard 1.104.0). Replays brandProfileSync against a recording D1 and stubbed
// GitHub, ORCID and Scholar, without network. Proves: every owner card is filed IDENTITY-BOUND with its copy text and deep link and is
// never reopened once resolved; a differing GitHub About is PATCHed and a matching one is left alone; topics are added only when
// missing; a refused write (bio without user scope) files a card with the exact text; probes close cards when the public record shows
// the new text; the six-hour throttle holds; the Copy box renders the text escaped and is wired into the three queue renderers.
// Run: node qnfo-fleet-dashboard/brand-sync.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const a = src.indexOf("var BRAND_SYNC_EVERY_MS"), b = src.indexOf("// The Copy box on an owner card");
const c2 = src.indexOf("\n}\n", src.indexOf("function copyRowHtml(")) + 3;
ok(a > 0 && b > a && c2 > b, "the BRAND-PROFILE-SYNC-1 block is in worker.js");

// A tiny D1: human_actions keyed by slug, plus the log table.
function makeDb() {
  const cards = new Map(), log = [];
  const stmt = (sql) => ({ args: [], bind(...x) { this.args = x; return this; },
    async run() {
      const A = this.args;
      if (/^INSERT INTO human_actions/.test(sql)) {
        const cur = cards.get(A[0]);
        if (!cur) cards.set(A[0], { slug: A[0], title: A[1], why: A[2], action: A[3], url: A[4], copy_text: A[5], status: "open", source: "brand-profile-sync" });
        else if (cur.status === "open") Object.assign(cur, { title: A[1], why: A[2], action: A[3], url: A[4], copy_text: A[5] });
        return { meta: { changes: 1 } };
      }
      if (/^UPDATE human_actions SET status='resolved'/.test(sql)) {
        const cur = cards.get(A[1]);
        if (cur && cur.status === "open") { cur.status = "resolved"; cur.resolution = A[0]; return { meta: { changes: 1 } }; }
        return { meta: { changes: 0 } };
      }
      if (/^INSERT INTO brand_profile_sync_log/.test(sql)) { log.push({ ts: new Date().toISOString().slice(0, 19) + "Z", result: A[0] }); return { meta: {} }; }
      return { meta: {} };
    },
    async first() { if (/FROM brand_profile_sync_log/.test(sql)) return log.length ? log[log.length - 1] : null; return null; }
  });
  return { cards, log, prepare: stmt };
}

function gh(opts) {
  const calls = [];
  const repos = opts.repos;
  const f = async (url, init = {}) => {
    const u = String(url), m = init.method || "GET";
    calls.push(m + " " + u.replace("https://api.github.com", ""));
    const J = (o, s = 200) => ({ ok: s < 400, status: s, json: async () => o, text: async () => JSON.stringify(o) });
    let r;
    if ((r = /api\.github\.com\/repos\/([^/]+\/[^/]+)$/.exec(u))) {
      if (m === "GET") return J(repos[r[1]] || {}, repos[r[1]] ? 200 : 404);
      if (m === "PATCH") { repos[r[1]].description = JSON.parse(init.body).description; return J({}); }
    }
    if ((r = /api\.github\.com\/repos\/([^/]+\/[^/]+)\/topics$/.exec(u))) { repos[r[1]].topics = JSON.parse(init.body).names; return J({}); }
    if (/api\.github\.com\/user$/.test(u)) return m === "GET" ? J({ login: "rwnq8", bio: opts.bio }) : J({ message: "Not Found" }, opts.bioWrite || 404);
    if (/api\.github\.com\/graphql$/.test(u)) return J({ data: { user: { pinnedItems: { nodes: (opts.pins || []).map((n) => ({ nameWithOwner: n })) } } } });
    if (/pub\.orcid\.org.*biography$/.test(u)) return J({ content: opts.orcidBio || "" });
    if (/pub\.orcid\.org.*keywords$/.test(u)) return J({ keyword: (opts.orcidKw || []).map((k) => ({ content: k })) });
    if (/scholar\.google\.com/.test(u)) return opts.scholar == null ? J({}, 429) : { ok: true, status: 200, text: async () => opts.scholar };
    return J({ error: "unexpected " + u }, 500);
  };
  return { f, calls };
}

const sb = { console, JSON, Date, Math, String, Array, Object, Promise, RegExp, Error, NAME: "qnfo-fleet-dashboard", fetch: async () => { throw new Error("network"); }, out: null };
sb.ensureHumanTable = async () => {};
vm.createContext(sb);
vm.runInContext(src.slice(a, c2) + "\n;out = { brandProfileSync, brandTextKey, copyRowHtml, BRAND_OWNER_CARDS, BRAND_GH_ABOUT, BRAND_GH_BIO, BRAND_GH_TOPICS, BRAND_GH_PINS, BRAND_LI_HEADLINE };", sb);
const M = sb.out;

// Brand wording guard: nothing quantum-led, no engineer/developer identity, the headline from BRAND.md.
const all = JSON.stringify([M.BRAND_OWNER_CARDS, M.BRAND_GH_ABOUT, M.BRAND_GH_BIO]);
ok(!/quantum/i.test(all) && !/software engineer|developer|programmer|coder/i.test(all.replace(/not a software engineer/g, "")), "no quantum-led or engineer wording in the brand text");
ok(/^Autonomous AI systems researcher/.test(M.BRAND_LI_HEADLINE) && M.BRAND_LI_HEADLINE.length <= 220, "LinkedIn headline is the brand line and fits 220 characters");
ok(M.BRAND_GH_BIO.length <= 160, "GitHub bio fits 160 characters", M.BRAND_GH_BIO.length);
ok(Object.values(M.BRAND_GH_ABOUT).every((d) => d.length <= 350), "every About text fits GitHub's 350 characters");
ok(M.BRAND_OWNER_CARDS.every((c) => /^IDENTITY-BOUND: /.test(c.why) && /^https:\/\//.test(c.url) && c.title && c.action), "every owner card is IDENTITY-BOUND with an https deep link");
ok(M.BRAND_OWNER_CARDS.filter((c) => c.slug !== "brand-github-pins").every((c) => c.copy && c.copy.length > 10), "every paste card carries its copy text");

// Run 1: stale GitHub, bio write refused, nothing visible on ORCID/Scholar yet.
const repos = {};
for (const r of Object.keys(M.BRAND_GH_ABOUT)) repos[r] = { description: "Research & Technology Leader | Quantum Computing", topics: ["qnfo"] };
repos["rwnq8/rwnq8"] = { description: M.BRAND_GH_ABOUT["rwnq8/rwnq8"], topics: M.BRAND_GH_TOPICS.slice() };
let db = makeDb(), net = gh({ repos, bio: "old bio", pins: ["rwnq8/resume"], scholar: null });
const env = { AUDIT: db, GITHUB_TOKEN: "ghp_SECRET" };
let r = await M.brandProfileSync(env, { fetch: net.f, now: Date.now(), force: true });
ok(r.github.repos["rwnq8/resume"] === "updated" && repos["rwnq8/resume"].description === M.BRAND_GH_ABOUT["rwnq8/resume"], "a stale About is written", r.github);
ok(r.github.repos["rwnq8/rwnq8"] === "ok" && !net.calls.includes("PATCH /repos/rwnq8/rwnq8"), "a matching About is left alone", net.calls);
ok(r.github.topics["rwnq8/resume"] === "added 5" && repos["rwnq8/resume"].topics[0] === "qnfo" && repos["rwnq8/resume"].topics.length === 6, "missing topics are added and existing ones kept", repos["rwnq8/resume"].topics);
ok(r.github.topics["rwnq8/rwnq8"] === "ok" && !("rwnq8/AIOS" in r.github.topics), "topics only on the profile repositories, only when missing", r.github.topics);
ok(/refused 404/.test(r.github.bio) && db.cards.get("brand-github-bio").copy_text === M.BRAND_GH_BIO && /IDENTITY-BOUND/.test(db.cards.get("brand-github-bio").why), "a refused bio write files a card with the exact text", r.github.bio);
ok(M.BRAND_OWNER_CARDS.every((c) => db.cards.get(c.slug) && db.cards.get(c.slug).status === "open"), "every owner card is filed open");
ok(db.cards.get("brand-linkedin-headline").copy_text === M.BRAND_LI_HEADLINE, "the LinkedIn card carries the headline to paste");
ok(r.probes["brand-scholar-affiliation"] === "unreadable" && r.probes["brand-orcid-bio"] === "old text", "probes report unreadable and old text honestly", r.probes);
ok(!JSON.stringify(r).includes("ghp_SECRET") && db.log.length === 1, "the token never reaches the logged result; one log row");

// Throttle: a second run inside six hours does nothing.
const n0 = net.calls.length;
r = await M.brandProfileSync(env, { fetch: net.f, now: Date.now() + 60e3 });
ok(r.skipped && net.calls.length === n0, "a run within six hours is skipped", r);

// BRAND-SYNC-ON-CHANGE-1: a fresh isolate inside six hours runs again when the logged text key differs, and skips when it matches.
{
  const fresh = (log) => { const s2 = { ...sb, out: null }; vm.createContext(s2); vm.runInContext(src.slice(a, c2) + "\n;out = { brandProfileSync, brandTextKey };", s2); return s2.out; };
  const F1 = fresh(), dbA = makeDb();
  dbA.log.push({ ts: new Date().toISOString().slice(0, 19) + "Z", result: JSON.stringify({ text_key: "stale" }) });
  const ra = await F1.brandProfileSync({ AUDIT: dbA }, { fetch: gh({ repos }).f, now: Date.now() + 60e3 });
  ok(!ra.skipped && ra.text_key === F1.brandTextKey(), "a changed brand text runs inside six hours", ra);
  const F2 = fresh(), dbB = makeDb();
  dbB.log.push({ ts: new Date().toISOString().slice(0, 19) + "Z", result: JSON.stringify({ text_key: F2.brandTextKey() }) });
  const rb = await F2.brandProfileSync({ AUDIT: dbB }, { fetch: gh({ repos }).f, now: Date.now() + 60e3 });
  ok(!!rb.skipped, "an unchanged brand text keeps the six-hour throttle", rb);
}

// Owner taps Done on LinkedIn; ORCID and Scholar now show the text; pins are set; bio still refused.
db.cards.get("brand-linkedin-headline").status = "resolved";
net = gh({ repos, bio: "old bio", pins: M.BRAND_GH_PINS, orcidBio: "Rowan ... focused on autonomous AI systems ...", orcidKw: ["autonomous AI systems"], scholar: '<div id="gsc_prf_in">Rowan</div><div>Autonomous AI systems researcher, QNFO</div><a href="/citations?view_op=search_authors&mauthors=label:autonomous_ai_systems">' });
r = await M.brandProfileSync(env, { fetch: net.f, now: Date.now() + 7 * 3600e3, force: true });
ok(db.cards.get("brand-linkedin-headline").status === "resolved", "a card the owner resolved is not reopened");
ok(["brand-orcid-bio", "brand-orcid-keywords", "brand-scholar-affiliation", "brand-scholar-interests", "brand-github-pins"].every((s) => db.cards.get(s).status === "resolved" && /brand-profile-sync/.test(db.cards.get(s).resolution)), "probes close the ORCID, Scholar and pins cards with evidence");
ok(db.cards.get("brand-x-bio").status === "open" && db.cards.get("brand-gmail-signature").status === "open", "cards without a public probe stay open until the owner taps Done");
ok(!net.calls.some((c) => /^PATCH \/repos/.test(c)), "an About already written is not written again", net.calls.filter((c) => /PATCH/.test(c)));

// Bio becomes writable: the card closes.
net = gh({ repos, bio: "old bio", bioWrite: 200, pins: M.BRAND_GH_PINS });
r = await M.brandProfileSync(env, { fetch: net.f, now: Date.now() + 14 * 3600e3, force: true });
ok(r.github.bio === "updated" && db.cards.get("brand-github-bio").status === "resolved", "a successful bio write closes its card", r.github.bio);

// No token: GitHub is skipped, cards still filed.
const db2 = makeDb();
r = await M.brandProfileSync({ AUDIT: db2 }, { fetch: gh({ repos }).f, force: true });
ok(r.github && r.github.skipped && db2.cards.size === M.BRAND_OWNER_CARDS.length, "no GITHUB_TOKEN: GitHub skipped, owner cards filed", r.github);

// Copy box.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const h = M.copyRowHtml('a <b> & "c"', esc);
ok(/<textarea readonly/.test(h) && h.includes("a &lt;b&gt; &amp; &quot;c&quot;") && /navigator\.clipboard/.test(h) && />Copy<\/button>/.test(h), "the Copy box escapes the text and copies it in one tap", h);
ok(M.copyRowHtml("", esc) === "", "no copy text, no box");
ok((src.match(/copyRowHtml\(it\.copy, e\)/g) || []).length === 3, "the Copy box is on all three queue renderers");
ok(/if \(it\.copy\) o\.copy = String\(it\.copy\)/.test(src) && /copy: r\.copy_text \|\| ""/.test(src), "copy_text flows from human_actions into the status document");
ok(/ctx\.waitUntil\(brandProfileSync\(env\)/.test(src) && /path === "\/api\/brand-sync"/.test(src), "the cron runs the sync and /api/brand-sync reports it");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
