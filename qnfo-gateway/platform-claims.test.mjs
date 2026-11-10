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
const qdsPage = (o, body) => "<title>" + o.title + "</title>" + body;
const mod = new Function("esc", "qdsPage", src.slice(a, b) + "\nreturn { handlePlatform, reset: function(){ PLATFORM_CACHE = { at: 0, data: null }; } };")(esc, qdsPage);

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

mod.reset();
const html = await (await mod.handlePlatform(envWith(rows, answers), false)).text();
ok(html.includes("1 of 3 claims pass their live check"), "the status sentence counts passing claims");
ok(html.includes("Claim A &lt;b&gt;"), "claim text is escaped");
ok(html.includes("Where it falls short"), "the page states its gaps");

mod.reset();
const broken = { AUDIT: { prepare() { return { all: async () => { throw new Error("no such table: product_claims"); } }; } } };
const bh = await (await mod.handlePlatform(broken, false)).text();
ok(bh.includes("could not be read just now"), "an unreadable table says what happens next");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
