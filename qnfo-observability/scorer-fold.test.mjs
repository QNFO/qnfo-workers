// SCORER-FOLD-1 (qnfo-observability 1.3.0, agent_issues 1756) offline suite. No network, synthetic data.
// Proves: the qnfo-autonomy-scorer code runs unchanged as the member scorerMod (only its version constant differs); the
// hourly "17 * * * *" tick runs it at 05:17 UTC and at no other hour; its read-only routes are served at /scorer/* (and
// writes are refused with 405); the member reports its own name and version.
// Run: node qnfo-observability/scorer-fold.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, existsSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const guest = readFileSync(new URL("../qnfo-autonomy-scorer/worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { scorerMod as __member, SCORER_VERSION as __mv, VERSION as __hv };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

{
  const lines = guest.split("\n");
  const body = lines.slice(lines.indexOf('var VERSION = "1.2.1-priority-queue";'), lines.length).filter((l) => l.trim() && l.trim() !== "export default {");
  const missing = body.filter((l) => !src.includes(l.trim()));
  ok(missing.length === 1 && missing[0].startsWith("var VERSION = "), "every scorer line is in the host except its VERSION line (and the export keyword)", missing.map((l) => l.slice(0, 60)));
  ok(/^1\.3\.1/.test(mod.__hv) && mod.__mv === "1.2.2-folded" && (src.match(/var VERSION = "/g) || []).length === 1, "host 1.3.1, member 1.2.2-folded, one quoted VERSION constant");
}

// the daily run happens on the 05:17 tick only
{
  let ran = 0;
  const real = mod.__member.scheduled;
  mod.__member.scheduled = async () => { ran++; };
  const env = { AUDIT: { prepare: () => { const s = { bind: () => s, run: async () => ({}), first: async () => null, all: async () => ({ results: [] }) }; return s; } }, LOGS: { list: async () => ({ objects: [] }), get: async () => null } };
  const tick = async (h) => { await mod.default.scheduled({ cron: "17 * * * *", scheduledTime: Date.UTC(2026, 9, 6, h, 17, 0) }, env, { waitUntil() {} }); };
  await tick(4); await tick(6); await tick(17);
  ok(ran === 0, "no scorer run at 04:17, 06:17 or 17:17", ran);
  await tick(5);
  ok(ran === 1, "one scorer run at 05:17 UTC", ran);
  // The scorer hands its run to waitUntil; the host must await it, not leave it 30 seconds after the handler returns.
  let done = false, memberCtxIsHost = null;
  const hostCtx = { waitUntil() {} };
  mod.__member.scheduled = async (ev, en, c) => { memberCtxIsHost = c === hostCtx; c.waitUntil(new Promise((r) => setTimeout(() => { done = true; r(); }, 60))); };
  await mod.default.scheduled({ cron: "17 * * * *", scheduledTime: Date.UTC(2026, 9, 6, 5, 17, 0) }, env, hostCtx);
  ok(done && memberCtxIsHost === false, "the member gets a collecting ctx and the host awaits its waitUntil work before the handler resolves", [done, memberCtxIsHost]);
  mod.__member.scheduled = real;
}

// routes
{
  const rows = [{ dimension: "s1_operations", framework: "vsm", score: 3, scale: 5, confidence: 0.8, scored_at: "2026-10-06", next_score: "2026-10-07", gap: "" }];
  const env = { AUDIT: { prepare: () => { const s = { bind: () => s, all: async () => ({ results: rows }), first: async () => null, run: async () => ({}) }; return s; } } };
  const h = await mod.default.fetch(new Request("https://qnfo-observability.q08.workers.dev/scorer/health"), env, {});
  const hj = await h.json();
  ok(h.status === 200 && hj.worker === "qnfo-autonomy-scorer" && hj.version === "1.2.2-folded", "/scorer/health answers as the member on the public hostname", hj);
  const sc = await mod.default.fetch(new Request("https://qnfo-observability.q08.workers.dev/scorer/scores"), env, {});
  ok(sc.status === 200 && JSON.stringify(await sc.json()).includes("s1_operations"), "/scorer/scores reads the scores");
  const post = await mod.default.fetch(new Request("https://qnfo-observability.q08.workers.dev/scorer/preview", { method: "POST" }), env, {});
  ok(post.status === 405, "the member stays read-only over HTTP (405 on POST)", post.status);
  const other = await mod.default.fetch(new Request("https://qnfo-observability.q08.workers.dev/workers/logs"), env, {});
  ok(other.status === 401 || other.status === 403, "the host's own token gate is unchanged for its private routes", other.status);
}
ok(existsSync(new URL("../qnfo-autonomy-scorer/FOLDED", import.meta.url)), "qnfo-autonomy-scorer carries a FOLDED marker");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
