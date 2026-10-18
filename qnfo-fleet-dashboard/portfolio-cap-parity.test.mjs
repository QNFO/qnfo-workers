// OWNER-VOICE-CAP-PARITY-1 offline suite (qnfo-fleet-dashboard 1.38.2, agent_issues 2729).
// The owner-voice guard and qnfo-social must agree on what a normal week is: the guard judged Bluesky at 2 a week while
// qnfo-social ran 21 (PAPER-ROLLUP-1), so the daily 05:00Z run re-paused every social channel day after day, and the
// guard also flagged q08.org links that Q08-OPEN-1 (owner directive 2026-10-09) made allowed. This test reads both worker
// files and proves (a) the two defaults are equal, (b) portfolioWeeklyCap honours SOCIAL_WEEKLY_CAP, (c) the q08-link rule
// is gated by SOCIAL_ALLOW_Q08 while mojibake and the cadence cap remain.
// Run: node qnfo-fleet-dashboard/portfolio-cap-parity.test.mjs   (exit 0 = all passed)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(path.join(here, "worker.js"), "utf8");
const social = readFileSync(path.join(here, "..", "qnfo-social", "worker.js"), "utf8");
const wrangler = readFileSync(path.join(here, "wrangler.toml"), "utf8");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// (a) The qnfo-social default is read from its weeklyCap return line; the guard's from its named constant.
const socialCap = (() => {
  const m = /return Number\.isFinite\(n\) && n >= 0 \? n : (\d+); \/\/ PAPER-ROLLUP-1/.exec(social);
  if (!m) throw new Error("qnfo-social weeklyCap default not found in worker.js");
  return Number(m[1]);
})();
const dashCap = (() => {
  const m = /var PORTFOLIO_SOCIAL_WEEKLY_CAP_DEFAULT = (\d+);/.exec(dash);
  if (!m) throw new Error("PORTFOLIO_SOCIAL_WEEKLY_CAP_DEFAULT not found in worker.js");
  return Number(m[1]);
})();
ok(socialCap === dashCap, "guard default " + dashCap + " equals qnfo-social weeklyCap default " + socialCap);
ok(dashCap === 21, "both are the PAPER-ROLLUP-1 cap, 21 a week (got " + dashCap + ")");

// (b) portfolioWeeklyCap, sliced out of the real worker (the guard-rcs.test.mjs pattern).
const slice = (name, end) => {
  const a = dash.indexOf("function " + name);
  const b = dash.indexOf(end, a);
  if (a < 0 || b <= a) throw new Error("function " + name + " not found in worker.js");
  return dash.slice(a, b);
};
const fns = new Function(
  'var PORTFOLIO_BSKY_ACTOR = "did:plc:vad2yeqflg5uznmp557zge5c"; var PORTFOLIO_BSKY_HANDLES = { "qnfo.org": 1, "qnfo.bsky.social": 1 }; var DAY_MS = 86400000;\n' +
  slice("portfolioMojibake(", "function portfolioCheckBluesky(") +
  slice("portfolioCheckBluesky(", "async function portfolioFetchJson(") +
  "\nreturn { portfolioWeeklyCap, portfolioCheckBluesky };"
)();
ok(fns.portfolioWeeklyCap({}) === 21, "portfolioWeeklyCap({}) is 21");
ok(fns.portfolioWeeklyCap({ SOCIAL_WEEKLY_CAP: "5" }) === 5, "env SOCIAL_WEEKLY_CAP wins");
ok(fns.portfolioWeeklyCap({ SOCIAL_WEEKLY_CAP: "x" }) === 21, "a bad value falls back to 21");
ok(fns.portfolioWeeklyCap({ SOCIAL_WEEKLY_CAP: "0" }) === 0, "0 is the STOP lever, not a fallback");

// (c) The Bluesky check: q08 links allowed, mojibake and cadence kept.
const now = Date.parse("2026-10-17T12:00:00Z");
const since = now - 30 * 86400000;
const item = (text, uri, ageMin) => ({
  post: {
    author: { handle: "qnfo.bsky.social" },
    uri,
    record: { text, createdAt: new Date(now - ageMin * 60000).toISOString() },
  },
});
const q08off = fns.portfolioCheckBluesky([item("read https://q08.org/essay", "at://x/q08", 30)], now, 21, since, false);
ok(q08off.violations.some((v) => v.rule === "q08-link"), "q08-link still counts when SOCIAL_ALLOW_Q08 is off");
const q08 = fns.portfolioCheckBluesky([item("read https://q08.org/essay", "at://x/q08", 30)], now, 21, since, true);
ok(q08.violations.length === 0, "a q08.org link is not a violation with SOCIAL_ALLOW_Q08=1 (Q08-OPEN-1): " + JSON.stringify(q08.violations));
const moji = fns.portfolioCheckBluesky([item("caf\u00c3\u00a9", "at://x/moji", 30)], now, 21, since);
ok(moji.violations.some((v) => v.rule === "mojibake"), "mojibake still counts");
const many = [];
for (let i = 0; i < 25; i++) many.push(item("ok " + i, "at://x/" + i, 60 + i * 60));
const over = fns.portfolioCheckBluesky(many, now, 21, since);
ok(over.violations.some((v) => v.rule === "cadence" && v.cap === 21), "the 7-day cadence still fires above 21");
const exactly = [];
for (let i = 0; i < 21; i++) exactly.push(item("ok " + i, "at://x/" + i, 60 + i * 60));
const inside = fns.portfolioCheckBluesky(exactly, now, 21, since);
ok(!inside.violations.some((v) => v.rule === "cadence"), "21 posts in 7 days is inside the cap");
ok(/portfolioQ08Link/.test(dash), "the q08-link helper is still in worker.js (1.38.3 semantics)");
ok(/function portfolioAllowQ08\(env\)/.test(dash), "SOCIAL_ALLOW_Q08 gates the q08-link rule in worker.js");

ok(/^\[vars\]/m.test(wrangler) && /^\s*SOCIAL_ALLOW_Q08\s*=\s*"1"/m.test(wrangler), "wrangler.toml sets SOCIAL_ALLOW_Q08=1 so a q08 link is not a violation (Q08-OPEN-1)");

console.log("portfolio-cap-parity: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
