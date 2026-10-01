// IDENTITY-WEEKLY-1 offline suite: replays jobIdentityWeekly against a synthetic Identity doc, stubbed public APIs and
// a recording D1, so CI proves the parser, the drift and claim checks, the deadline arithmetic and the run-row write
// without network or the owner's private data (the real doc lives only in D1 qnfo-audit.owner_docs).
// Run: node qnfo-cloud-ops/identity-weekly.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const start = src.indexOf("var IDW_ORCID");
const end = src.indexOf('__name(jobVisibilityAndIdentity, "jobVisibilityAndIdentity");');
if (start < 0 || end < 0) throw new Error("IDENTITY-WEEKLY-1 block not found in worker.js");
const block = src.slice(start, end) + "\n;({ jobIdentityWeekly, jobVisibilityAndIdentity, idwOpportunities, idwCanonical, idwDeadline });";

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
  "| 4 | [Past call](https://example.org/d), Org D | $4 | 3 Sep 2026 | close |", "",
  "## Weekly log", ""
].join("\n");

const NOW = Date.UTC(2026, 9, 1, 12);
const API = {
  "public.api.bsky.app": { displayName: "Rowan Brad Quni-Gudzinas", description: "I build open, auditable AI-assisted research (QNFO). qnfo.org", followersCount: 50, postsCount: 1410 },
  "api.github.com/users": { name: "Rowan Brad Quni-Gudzinas", bio: "Quantum Computing Architect; 649+ Publications; Patent Portfolio" },
  "api.github.com/orgs": { description: "Open, auditable research infrastructure" },
  "pub.orcid.org": { name: { "given-names": { value: "Rowan Brad" }, "family-name": { value: "Quni-Gudzinas" } }, biography: { content: "Builder." }, "other-names": { "other-name": [{ content: "Brad Gudzinas" }] } },
  "zenodo.org/api/records?": { hits: { total: 940 } },
  "zenodo.org/api/records/21806274": { metadata: { version: "v3.12" }, stats: { views: 100, unique_views: 90, downloads: 7 } },
  "mstdn.science": null
};
const fetchStub = async (url) => {
  if (String(url).includes("example.org/gone")) return { ok: false, status: 404 };
  if (String(url).includes("example.org")) return { ok: true, status: 200 };
  for (const [k, body] of Object.entries(API)) if (String(url).includes(k)) return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 503 };
  return { ok: false, status: 599 };
};
const writes = [];
const mails = [];
const prevScore = JSON.stringify({ bluesky_followers: 42, zenodo_records_orcid: 939, openalex: { citations: 2 }, portfolio_record: { views: 90 } });
const D1 = { prepare(sql) { return { args: [], bind(...a) { this.args = a; return this; },
  async first() { if (/FROM owner_docs/.test(sql)) return { body_md: DOC, updated_at: "2026-10-01" };
    if (/FROM citation_stats/.test(sql)) return { dois: 63, cites: 3, cited: 2 };
    if (/FROM portfolio_runs/.test(sql)) return { scorecard_json: prevScore }; return null; },
  async all() { return { results: /FROM emails/.test(sql) ? [{ sender: "Grants Team <grants@fund.example>", subject: "Your application", received_at: "2026-09-30 10:00:00" }] : [] }; },
  async run() { writes.push({ sql, args: this.args }); return { success: true }; } }; } };
class FixedDate extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
const ctx = vm.createContext({
  Date: FixedDate, JSON, Math, String, Number, Object, Array, RegExp, Promise, encodeURIComponent, setTimeout, clearTimeout,
  AbortController, console, NL: "\n", VERSION: "test", fetch: fetchStub, __name: (f) => f,
  storeDigest: async (env, job, subject, text) => { writes.push({ sql: "digest", args: [job, subject, text] }); },
  sendDigest: async (env, subject, text) => { mails.push({ subject, text }); return { ok: true }; },
  jobVisibility: async () => ({ status: "ok", notes: {} })
});
const m = vm.runInContext(block, ctx, { filename: "qnfo-cloud-ops/worker.js#IDENTITY-WEEKLY-1" });

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log("FAIL " + msg); } };

const opps = m.idwOpportunities(DOC, NOW);
ok(opps.length === 4, "4 opportunity rows");
ok(opps[0].deadline.date === null, "Rolling has no date");
ok(opps[1].deadline.date === "2026-10-05" && opps[1].deadline.days_left === 3, "Mon D, YYYY deadline and days left");
ok(opps[2].deadline.date === "2026-12-01", "ISO deadline");
ok(opps[3].deadline.days_left < 0, "D Mon YYYY deadline in the past");
const canon = m.idwCanonical(DOC);
ok(canon.short_bio === "I build open, auditable AI-assisted research (QNFO). qnfo.org", "short bio");
ok(canon.gh_org_description === "Open, auditable research infrastructure", "gh org canonical cell");
ok(canon.gh_user_bio === "Founder of QNFO, research systems builder", "gh user canonical after the name");

const out = await m.jobIdentityWeekly({ AUDIT: D1, GH_TOKEN: "" });
const row = writes.find((w) => /INSERT INTO portfolio_runs/.test(w.sql));
ok(!!row, "one portfolio_runs row");
const [runDate, session, summary, scJson, actJson, needs] = row ? row.args : [];
const sc = JSON.parse(scJson || "{}");
const act = JSON.parse(actJson || "{}");
ok(runDate === "2026-10-01" && session === "qnfo-cloud-ops/test", "run date and session stamp");
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
ok(mails.length === 1 && /urgent/.test(mails[0].subject), "urgent items email the owner once");
ok(out.status === "ok" && out.notes.owner_items >= 5, "job status ok");
ok(!writes.some((w) => /owner_docs/.test(w.sql) && /UPDATE|INSERT|DELETE/i.test(w.sql)), "never writes the owner's doc");

const both = await m.jobVisibilityAndIdentity({ AUDIT: D1, GH_TOKEN: "x" });
ok(both.notes.visibility === "ok" && both.notes.identity === "ok", "visibility tick runs both");
ctx.jobVisibility = async () => { throw new Error("boom"); };
const half = await m.jobVisibilityAndIdentity({ AUDIT: D1, GH_TOKEN: "x" });
ok(half.status === "degraded" && half.notes.identity === "ok", "a visibility failure does not block the identity review");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
