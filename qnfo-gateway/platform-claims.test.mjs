// ULTRASTABLE-CLAIMS-1: /platform runs every product claim's probe and shows pass or fail; a probe that is not a single SELECT never runs.
// run: node qnfo-gateway/platform-claims.test.mjs -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("FAIL: " + msg); } }

const a = src.indexOf("var PLATFORM_CACHE"), b = src.indexOf("async function handleAbout(env)");
ok(a > 0 && b > a, "platform code sits before handleAbout");
ok(src.includes('if (p === "/platform") return handlePlatform(env, false);'), "/platform is routed");
ok(src.includes('if (p === "/api/platform-claims") return handlePlatform(env, true);'), "/api/platform-claims is routed");
const esc = (t) => (t ? String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "");
const qdsPage = (o, body) => "<title>" + o.title + "</title>" + (o.jsonld || "") + body;
const health = () => new Response(JSON.stringify({ worker: "qnfo-gateway" }), { headers: { "Content-Type": "application/json" } });
const mod = new Function("esc", "qdsPage", "health", "subscribeBlock", src.slice(a, b) + "\nreturn { handlePlatform, ultrastableRoute, reset: function(){ PLATFORM_CACHE = { at: 0, data: null }; } };")(esc, qdsPage, health, (source) => '<form id="ld-sub-form" data-source="' + source + '"></form>');

function envWith(rows, answers) {
  return { AUDIT: { prepare(sql) {
    return {
      all: async () => ({ results: rows }),
      first: async () => { if (!(sql in answers)) throw new Error("no such table"); return answers[sql]; },
    };
  } } };
}
const rows = [
  { id: "a", claim: "Claim A <b>", probe_sql: "SELECT 1", evidence_note: "x" },
  { id: "b", claim: "Claim B", probe_sql: "SELECT 2", evidence_note: "y" },
  { id: "c", claim: "Claim C", probe_sql: "DELETE FROM agent_issues", evidence_note: "z" },
];
const answers = { "SELECT 1": { expected: "ok", observed: "ok", detail: "7 things" }, "SELECT 2": { expected: "ok", observed: "stale", detail: "0 things" } };

mod.reset();
const j = await (await mod.handlePlatform(envWith(rows, answers), true)).json();
ok(j.total === 3 && j.passing === 1, "one of three passes, got " + j.passing + "/" + j.total);
ok(j.claims[0].pass === true && j.claims[0].detail === "7 things", "a passing claim carries its detail");
ok(j.claims[1].pass === false, "an observed value that differs from expected fails");
ok(j.claims[2].pass === false && /single SELECT/.test(j.claims[2].detail), "a probe that is not a SELECT never runs");

// A semicolon inside a string literal (a detail such as "7 scored; all time 3") is part of one SELECT and runs (live defect 2026-11-10: 4 of 7 claims refused).
mod.reset();
const semiRows = [
  { id: "d", claim: "Claim D", probe_sql: "SELECT 'ok' AS expected, 'ok' AS observed, '7 scored; all time 3' AS detail", evidence_note: "w" },
  { id: "e", claim: "Claim E", probe_sql: "SELECT 1; DELETE FROM agent_issues", evidence_note: "v" },
];
const semiAnswers = { [semiRows[0].probe_sql]: { expected: "ok", observed: "ok", detail: "7 scored; all time 3" } };
const sj = await (await mod.handlePlatform(envWith(semiRows, semiAnswers), true)).json();
ok(sj.claims[0].pass === true, "a semicolon inside a quoted string does not refuse the probe");
ok(sj.claims[1].pass === false && /single SELECT/.test(sj.claims[1].detail), "a second statement after a semicolon is refused");

mod.reset();
const html = await (await mod.handlePlatform(envWith(rows, answers), false)).text();
ok(html.includes("1 of 3 claims pass their live check"), "the status sentence counts passing claims");
ok(html.includes("Claim A &lt;b&gt;"), "claim text is escaped");
ok(html.includes("Where it falls short"), "the page states its gaps");

mod.reset();
const broken = { AUDIT: { prepare() { return { all: async () => { throw new Error("no such table: product_claims"); } }; } } };
const bh = await (await mod.handlePlatform(broken, false)).text();
ok(bh.includes("could not be read just now"), "an unreadable table says what happens next");

// ULTRASTABLE-CREATOR-LINK-1: the credit, the author schema and the name come from product_profile; an owner "no" removes the credit.
function envProfile(profile) {
  return { AUDIT: { prepare(sql) { return {
    all: async () => ({ results: /product_profile/.test(sql) ? profile : rows.slice(0, 1) }),
    first: async () => answers["SELECT 1"],
  }; } } };
}
mod.reset();
const ch = await (await mod.handlePlatform(envProfile([]), false)).text();
ok(ch.includes('Directed by <a href="https://rwnq8.github.io/" rel="author">Rowan Brad Quni-Gudzinas</a>'), "the default credit names Rowan and links the personal site");
ok(ch.includes('"@type":"SoftwareApplication"') && ch.includes('"creator":{"@id":"https://qnfo.org/#person"}'), "the page carries a SoftwareApplication with Rowan as creator");
ok(ch.includes("orcid.org/0009-0002-4317-5604"), "the credit carries the sameAs links");
mod.reset();
const cj = await (await mod.handlePlatform(envProfile([{ key: "name", value: "Homeostat" }, { key: "creator_role", value: "Designed and directed by" }]), true)).json();
ok(cj.product === "Homeostat" && cj.directed_by && cj.directed_by.role === "Designed and directed by", "an answered profile row changes the name and the credit");
mod.reset();
const nh = await (await mod.handlePlatform(envProfile([{ key: "credit_visible", value: "0" }, { key: "creator_url", value: "javascript:alert(1)" }]), false)).text();
ok(!nh.includes("Directed by") && !nh.includes('"creator"'), "credit_visible 0 removes the credit and the creator");
mod.reset();
const xj = await (await mod.handlePlatform(envProfile([{ key: "creator_url", value: "javascript:alert(1)" }]), true)).json();
ok(xj.directed_by.url === "https://rwnq8.github.io/", "a non-https link falls back to the default");

// ULTRASTABLE-DOMAIN-1: ultrastable.io serves the claims page; .app, .net and www answer 301 to it; other paths go to qnfo.org.
ok(src.includes("const us = ultrastableRoute(host, p, u);"), "the host router consults ultrastableRoute");
const R = (h, path) => { const x = new URL("https://" + h + path); return mod.ultrastableRoute(h, x.pathname, x); };
ok(R("qnfo.org", "/") === null, "other hosts are untouched");
ok(R("ultrastable.io", "/") === "page" && R("ultrastable.io", "/api/platform-claims") === "json", "the home serves the page and its JSON");
ok(R("ultrastable.app", "/x?y=1").headers.get("Location") === "https://ultrastable.io/x?y=1" && R("www.ultrastable.net", "/").status === 301, "aliases answer 301 to ultrastable.io");
ok(R("ultrastable.io", "/papers").headers.get("Location") === "https://qnfo.org/papers", "unknown paths on the home go to qnfo.org");
ok(R("ultrastable.app", "/health").status === 200, "every alias answers /health directly for the route probe");
mod.reset();
const uh = await (await mod.handlePlatform(envProfile([{ key: "home_url", value: "https://ultrastable.io" }]), false)).text();
ok(uh.includes('"url":"https://ultrastable.io"'), "the schema url follows product_profile.home_url");

ok(html.includes('data-exp="platform_cta_v1"') && html.includes('data-source="platform-cta"'), "html /platform carries the subscribe CTA tagged platform-cta / platform_cta_v1");
ok(!JSON.stringify(j).includes("platform_cta_v1"), "the JSON claims payload is unchanged by the CTA");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
