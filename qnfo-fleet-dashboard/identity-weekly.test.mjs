// IDENTITY-WEEKLY-1 offline suite: replays jobIdentityWeekly against a synthetic Identity doc, stubbed public APIs and
// a recording D1, so CI proves the parser, the drift and claim checks, the deadline arithmetic, the run-row write, the
// owner queue card and the Monday-once throttle, without network or the owner's private data (the real doc lives only in
// the private D1 qnfo-identity). Moved with the job from qnfo-cloud-ops (IDENTITY-STORE-1).
// Run: node qnfo-fleet-dashboard/identity-weekly.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const start = src.indexOf("var IDW_NL");
const end = src.indexOf('__name(identityWeeklyRun, "identityWeeklyRun");');
if (start < 0 || end < 0) throw new Error("IDENTITY-WEEKLY-1 block not found in worker.js");
const block = src.slice(start, end) + "\n;({ jobIdentityWeekly, identityWeeklyRun, idwOpportunities, idwCanonical, idwDeadline });";

const DOC = [
  "# Identity", "", "## Your brand", "", "**Short bio** (Bluesky, X, Mastodon)", "",
  "> I build open, auditable AI-assisted research (QNFO). qnfo.org", "", "### Per platform", "",
  "| Platform | Field | Set it to |", "|---|---|---|",
  "| GitHub org QNFO | Description | Open, auditable research infrastructure |",
  "| GitHub user rwnq8 | Name, bio | Rowan Brad Quni-Gudzinas; Founder of QNFO, research systems builder |", "",
  "## Opportunities", "", "| # | Lead | Pay | Deadline | Next step |", "|---|---|---|---|---|",
  "| 1 | [Rolling role](https://example.org/a), Org A | $1 | Rolling | apply |",
  "| 2 | [Soon grant](https://example.org/b), Org B | $2 | Oct 5, 2026 | draft |",
  "| 3 | [Gone call](https://example.org/gone), Org C | $3 | 2026-12-01 | check |",
  "| 4 | [Past call](https://example.org/d), Org D | $4 | 3 Sep 2026 | close |",
  "| 5 | [Decided call](https://example.org/e), Org E | $5 | Not pursued (was 2026-10-03) | none |", "",
  "## Weekly log", ""
].join("\n");

const NOW = Date.UTC(2026, 9, 1, 12);
// Keyed by exact host + path (no substring matching).
const API = {
  "public.api.bsky.app/xrpc/app.bsky.actor.getProfile": { displayName: "Rowan Brad Quni-Gudzinas", description: "I build open, auditable AI-assisted research (QNFO). qnfo.org", followersCount: 50, postsCount: 1410 },
  "api.github.com/users/rwnq8": { name: "Rowan Brad Quni-Gudzinas", bio: "Quantum Computing Architect; 649+ Publications; Patent Portfolio" },
  "api.github.com/orgs/QNFO": { description: "Open, auditable research infrastructure" },
  "pub.orcid.org/v3.0/0009-0002-4317-5604/person": { name: { "given-names": { value: "Rowan Brad" }, "family-name": { value: "Quni-Gudzinas" } }, biography: { content: "Builder." }, "other-names": { "other-name": [{ content: "Brad Gudzinas" }] } },
  "zenodo.org/api/records": { hits: { total: 940 } },
  "zenodo.org/api/records/21806274": { metadata: { version: "v3.12" }, stats: { views: 100, unique_views: 90, downloads: 7 } },
  "mstdn.science/api/v1/accounts/lookup": null
};
const fetchStub = async (url) => {
  const u = new URL(String(url));
  if (u.hostname === "example.org") return u.pathname === "/gone" ? { ok: false, status: 404 } : { ok: true, status: 200 };
  const k = u.hostname + u.pathname;
  if (!(k in API)) return { ok: false, status: 599 };
  return API[k] ? { ok: true, status: 200, json: async () => API[k] } : { ok: false, status: 503 };
};
const writes = [];
const events = new Map();
const prevScore = JSON.stringify({ bluesky_followers: 42, zenodo_records_orcid: 939, openalex: { citations: 2 }, portfolio_record: { views: 90 } });
const D1 = { prepare(sql) { return { args: [], bind(...a) { this.args = a; return this; },
  async first() { if (/FROM owner_docs/.test(sql)) return { body_md: DOC, updated_at: "2026-10-01" };
    if (/FROM citation_stats/.test(sql)) return { dois: 63, cites: 3, cited: 2 };
    if (/FROM portfolio_runs/.test(sql)) return { scorecard_json: prevScore }; return null; },
  async all() { return { results: /FROM emails/.test(sql) ? [{ sender: "Grants Team <grants@fund.example>", subject: "Your application", received_at: "2026-09-30 10:00:00" }] : [] }; },
  async run() { writes.push({ sql, args: this.args });
    if (/INTO cloud_ops_events/.test(sql)) events.set(this.args[0], { ts: this.args[1], status: this.args[5], meta: this.args[3] });
    return { success: true }; } }; } };
const d1allStub = async (db, sql, params) => /FROM cloud_ops_events/.test(sql) ? (events.has(params[0]) ? [events.get(params[0])] : []) : [];
class FixedDate extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
const ctx = vm.createContext({
  Date: FixedDate, JSON, Math, String, Number, Object, Array, RegExp, Promise, encodeURIComponent, setTimeout, clearTimeout,
  AbortController, console, TextEncoder, NAME: "qnfo-fleet-dashboard", VERSION: "test", fetch: fetchStub, __name: (f) => f,
  // NAME-HELPER-STUBS-1: every bundler rename helper the block uses (__name2, __name22, ...); a landing of deployed code
  // adds a new suffix each time (1e97bab added __name2 and broke deploy-gate for every PR from 2026-10-04).
  ...Object.fromEntries([...new Set(block.match(/\b__name\d+\b/g) || [])].map((k) => [k, (f) => f])),
  ownerStore: async (env) => env.IDENTITY || env.AUDIT, d1all: d1allStub, reachErr: (e) => String(e && e.message || e),
  PORTFOLIO_RUNNING_STALE_MS: 600000, PORTFOLIO_MAX_ATTEMPTS: 3
});
// A re-bundled worker.js (wrangler/esbuild, e.g. LAND-CODE-FIX-1 landing the deployed script) wraps functions in
// __name2, __name22, ... helpers; define every one the block uses so the suite tests the job, not the bundler (#608).
for (const h of new Set(block.match(/\b__name\d+\b/g) || [])) ctx[h] = (f) => f;
const m = vm.runInContext(block, ctx, { filename: "qnfo-fleet-dashboard/worker.js#IDENTITY-WEEKLY-1" });

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log("FAIL " + msg); } };

const opps = m.idwOpportunities(DOC, NOW);
ok(opps.length === 4, "4 opportunity rows (the Not pursued lead is skipped)");
ok(!opps.some((o) => o.n === 5), "IDENTITY-WEEKLY-DELEGATED-1: a decided lead gets no deadline, probe or card");
ok(opps[0].deadline.date === null, "Rolling has no date");
ok(opps[1].deadline.date === "2026-10-05" && opps[1].deadline.days_left === 3, "Mon D, YYYY deadline and days left");
ok(opps[2].deadline.date === "2026-12-01", "ISO deadline");
ok(opps[3].deadline.days_left < 0, "D Mon YYYY deadline in the past");
const canon = m.idwCanonical(DOC);
ok(canon.short_bio === "I build open, auditable AI-assisted research (QNFO). qnfo.org", "short bio");
ok(canon.gh_org_description === "Open, auditable research infrastructure", "gh org canonical cell");
ok(canon.gh_user_bio === "Founder of QNFO, research systems builder", "gh user canonical after the name");

const out = await m.jobIdentityWeekly({ AUDIT: D1, IDENTITY: D1, GITHUB_TOKEN: "" });
const row = writes.find((w) => /INSERT INTO portfolio_runs/.test(w.sql));
ok(!!row, "one portfolio_runs row");
const [runDate, session, summary, scJson, actJson, needs] = row ? row.args : [];
const sc = JSON.parse(scJson || "{}");
const act = JSON.parse(actJson || "{}");
ok(runDate === "2026-10-01" && session === "qnfo-fleet-dashboard/test", "run date and session stamp");
ok(/kind='identity-weekly'|'identity-weekly'/.test(row ? row.sql : ""), "kind identity-weekly");
ok(sc.bluesky_followers === 50 && sc.zenodo_records_orcid === 940 && sc.openalex.citations === 3, "metrics from the APIs and D1");
ok(sc.deltas.bluesky_followers === 8 && sc.deltas.zenodo_records_orcid === 1 && sc.deltas.openalex_citations === 1 && sc.deltas.portfolio_views === 10, "deltas against the previous run");
ok(act.gaps.length === 1 && /mastodon/.test(act.gaps[0]), "a failed source is a gap, not a number");
ok(sc.mastodon_followers === undefined, "no number invented for the failed source");
const gh = act.profiles.find((p) => p.platform === "github rwnq8");
ok(gh && gh.banned_claims.includes("inflated publication count") && gh.banned_claims.includes("patent claim without application numbers"), "banned claims found in a live bio");
ok(act.profiles.find((p) => p.platform.startsWith("bluesky")).bio_matches_canonical === true, "matching bio is not flagged");
ok(act.profiles.find((p) => p.platform.startsWith("orcid")).name_ok === true, "ORCID name matches");
ok(/github rwnq8: remove/.test(needs) && /bio differs/.test(needs), "owner items name the field");
ok(/lead 2 .*in 3 days/.test(needs) && /lead 4 .*has passed/.test(needs) && /lead 3 .*returns 404/.test(needs), "deadline and page checks");
ok(/possible funder\/employer replies/.test(needs) && act.replies[0].from_domain === "fund.example" && !("body" in act.replies[0]), "replies carry domain and subject only");
ok(act.opportunities.every((o) => o.page_status != null), "every lead page probed");
const card = writes.find((w) => /INSERT INTO human_actions/.test(w.sql));
ok(card && card.args[0] === "identity-weekly-2026-10-01" && /urgent/.test(card.sql) && /lead 2 due 2026-10-05/.test(card.args[2]) && out.notes.card === "identity-weekly-2026-10-01", "urgent items open one owner queue card");
ok(writes.filter((w) => /INSERT INTO human_actions/.test(w.sql)).length === 1, "exactly one card per run");
ok(out.status === "ok" && out.notes.owner_items >= 5, "job status ok");
ok(!writes.some((w) => /owner_docs/.test(w.sql) && /UPDATE|INSERT|DELETE/i.test(w.sql)), "never writes the owner's doc");

ok(Array.isArray(act.inbound_held) && act.inbound_held.length === 0 && !/INBOUND-SLA-1/.test(needs), "no INBOUND-SLA-1 decision rows: nothing listed, no owner item");

// INBOUND-SLA-1: inbound mail the fleet held without a substantive answer is listed by category and sender domain only.
const heldMeta = JSON.stringify({ queue_id: 14, category: "funder", outcome: "held", domain: "fund.example", age_h: 30.5, reason: "a funder", thread_key: "ab" });
const withHeld = { prepare(sql) { const q = D1.prepare(sql); if (/FROM cloud_ops_events WHERE id >= 'inbound-sla-q-'/.test(sql)) q.all = async () => ({ results: [{ id: "inbound-sla-q-14", ts: "2026-09-30T10:00:00.000Z", meta: heldMeta }] }); return q; } };
await m.jobIdentityWeekly({ AUDIT: withHeld, IDENTITY: withHeld, GITHUB_TOKEN: "" });
const hRow = writes.filter((w) => /INSERT INTO portfolio_runs/.test(w.sql)).pop();
const hAct = JSON.parse(hRow.args[4]);
ok(hAct.inbound_held.length === 1 && hAct.inbound_held[0].category === "funder" && hAct.inbound_held[0].from_domain === "fund.example" && !("reason" in hAct.inbound_held[0]) && !JSON.stringify(hAct.inbound_held).includes("@"), "held inbound items carry category, domain and age only");
ok(/1 inbound messages held by INBOUND-SLA-1/.test(hRow.args[5]), "and become one owner item in the weekly review");

// IDENTITY-WEEKLY-DELEGATED-1: under the owner's queue delegation the findings are still recorded, but no card is filed.
const flagged = { prepare(sql) { const q = D1.prepare(sql); if (/FROM pipeline_flags/.test(sql)) q.first = async () => ({ value: "1" }); return q; } };
const cardsBefore = writes.filter((w) => /INSERT INTO human_actions/.test(w.sql)).length;
const runsBeforeD = writes.filter((w) => /INSERT INTO portfolio_runs/.test(w.sql)).length;
const dOut = await m.jobIdentityWeekly({ AUDIT: flagged, IDENTITY: flagged, GITHUB_TOKEN: "" });
ok(writes.filter((w) => /INSERT INTO human_actions/.test(w.sql)).length === cardsBefore, "delegated: no owner queue card");
ok(writes.filter((w) => /INSERT INTO portfolio_runs/.test(w.sql)).length === runsBeforeD + 1 && dOut.notes.urgent > 0 && /^delegated: /.test(dOut.notes.card), "delegated: findings still recorded, card note says why");

// Scheduling: Mondays after 06:00Z, once per day (cloud_ops_events throttle), never on other days.
const thu = await m.identityWeeklyRun({ AUDIT: D1, IDENTITY: D1 }, { nowMs: Date.UTC(2026, 9, 1, 12) });
ok(thu.not_now === true, "does not run on a Thursday");
const early = await m.identityWeeklyRun({ AUDIT: D1, IDENTITY: D1 }, { nowMs: Date.UTC(2026, 9, 5, 5, 45) });
ok(early.not_now === true, "does not run on Monday before 06:00Z");
const runsBefore = writes.filter((w) => /INSERT INTO portfolio_runs/.test(w.sql)).length;
const mon = await m.identityWeeklyRun({ AUDIT: D1, IDENTITY: D1 }, { nowMs: Date.UTC(2026, 9, 5, 6, 15) });
ok(mon.status === "ok" && writes.filter((w) => /INSERT INTO portfolio_runs/.test(w.sql)).length === runsBefore + 1, "runs on Monday after 06:00Z and writes one row");
ok(events.get("identity-weekly-2026-10-05") && events.get("identity-weekly-2026-10-05").status === "ok", "records the run on cloud_ops_events");
const again = await m.identityWeeklyRun({ AUDIT: D1, IDENTITY: D1 }, { nowMs: Date.UTC(2026, 9, 5, 6, 30) });
ok(again.throttled === "2026-10-05" && writes.filter((w) => /INSERT INTO portfolio_runs/.test(w.sql)).length === runsBefore + 1, "a second tick the same Monday is throttled");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
