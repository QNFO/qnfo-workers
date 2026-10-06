// ERRATA-FOLD-1 (qnfo-research-exec 0.9.65, agent_issues 1756) offline suite. No network, synthetic data.
// Proves: the errata-hub bundle runs unchanged as the member errataMod (only its node:buffer imports, its VERSION line and
// its export line differ); the host's */15 tick runs its three jobs at their own minutes (:00 watch, :15 respond, :30
// publish; nothing at :45), each as a table entry, awaited, with PAPERS_DB = LIVING_PAPER, WATCH_DB = AUDIT_DB = QNFO_AUDIT
// and the host's GRAPH_DB, MIRROR, BROWSER, SEND_EMAIL and ZENODO_TOKEN; GET /errata-hub/health is public; every other
// route of the member answers only a service binding whose props name it with a qnfo-* caller (the props stand in for
// ERRATA_TOKEN), and is not reachable from the public host; wrangler.toml carries nodejs_compat, BROWSER and SEND_EMAIL.
// Run: node qnfo-research-exec/errata-fold.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, existsSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const guest = readFileSync(new URL("../errata-hub/worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { errataMod as __member, ERRATA_VERSION as __mv, VERSION as __hv, errataJobAt as __job };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

{
  const missing = guest.split("\n").filter((l) => l.trim() && !src.includes(l.trim()));
  ok(missing.length === 4 && missing.filter((l) => l.startsWith("import { Buffer as Buffer")).length === 2 && missing.some((l) => l.startsWith("var VERSION = ")) && missing.some((l) => l === "export default {"),
    "every errata-hub line is in the host except its two node:buffer imports, its VERSION line and its export", missing.map((l) => l.slice(0, 60)));
  ok(/^0\.9\.(6[5-9]|[7-9]\d|\d{3,})/.test(mod.__hv) && mod.__mv === "1.4.2-folded" && (src.match(/var VERSION = "/g) || []).length === 1, "host 0.9.65 or later, member 1.4.2-folded, one quoted VERSION constant", [mod.__hv, mod.__mv]);
  ok(/^import \{ Buffer as __ErrataBuffer \} from "node:buffer";\n/.test(src), "the host imports node:buffer once for the member");
}

{
  const at = (m) => Date.UTC(2026, 9, 6, 9, m, 4);
  ok(mod.__job(at(0)) === "0 * * * *" && mod.__job(at(14)) === "0 * * * *" && mod.__job(at(15)) === "15 * * * *" && mod.__job(at(30)) === "30 * * * *" && mod.__job(at(44)) === "30 * * * *" && mod.__job(at(45)) === null,
    "the */15 tick maps to the member's own minutes: :00 watch, :15 respond, :30 publish, nothing at :45");
}

const db = (tag) => { const s = { bind: () => s, run: async () => ({ success: true, meta: {} }), first: async () => null, all: async () => ({ results: [] }) }; return { tag, prepare: () => s }; };
const mkEnv = () => ({ LIVING_PAPER: db("living"), QNFO_AUDIT: db("audit"), GRAPH_DB: db("graph"), MIRROR: { tag: "r2" }, BROWSER: { tag: "browser" }, SEND_EMAIL: { tag: "mail" }, ZENODO_TOKEN: "z", AI: { run: async () => ({ response: "x" }) }, RESEARCH_HALT: "1" });

{
  const real = mod.__member.scheduled;
  const calls = []; let done = false;
  mod.__member.scheduled = async (ev, env, c) => { calls.push({ ev, env }); c.waitUntil(new Promise((r) => setTimeout(() => { done = true; r(); }, 50))); };
  const env = mkEnv();
  await mod.default.scheduled({ cron: "*/15 * * * *", scheduledTime: Date.UTC(2026, 9, 6, 9, 30, 3) }, env, { waitUntil(p) { p.catch(() => {}); } });
  const c = calls[0];
  ok(calls.length === 1 && c.ev.cron === "30 * * * *" && c.ev.tickEntry === true, "the 09:30 tick runs the member's publish job as a table entry", calls.map((x) => x.ev));
  ok(c && c.env.PAPERS_DB === env.LIVING_PAPER && c.env.WATCH_DB === env.QNFO_AUDIT && c.env.AUDIT_DB === env.QNFO_AUDIT && c.env.GRAPH_DB === env.GRAPH_DB && c.env.MIRROR === env.MIRROR && c.env.BROWSER === env.BROWSER && c.env.SEND_EMAIL === env.SEND_EMAIL && c.env.ZENODO_TOKEN === "z",
    "the member gets PAPERS_DB = LIVING_PAPER, WATCH_DB = AUDIT_DB = QNFO_AUDIT and the host's GRAPH_DB, MIRROR, BROWSER, SEND_EMAIL, ZENODO_TOKEN");
  ok(done, "the handler awaits the member's waitUntil work");
  await mod.default.scheduled({ cron: "*/15 * * * *", scheduledTime: Date.UTC(2026, 9, 6, 9, 45, 3) }, mkEnv(), { waitUntil(p) { p.catch(() => {}); } });
  ok(calls.length === 1, "the :45 tick runs no member job");
  mod.__member.scheduled = real;
}

{
  const pub = "https://qnfo-research-exec.q08.workers.dev";
  const h = await mod.default.fetch(new Request(pub + "/errata-hub/health"), mkEnv(), {});
  const hj = await h.json();
  ok(h.status === 200 && hj.worker === "errata-hub" && hj.version === "1.4.2-folded", "GET /errata-hub/health answers as the member", hj);
  const props = { caller: "qnfo-ops", member: "errata-hub" };
  const viaBinding = await mod.default.fetch(new Request("https://internal/internal-errata", { method: "POST", body: "not json" }), mkEnv(), { props });
  ok(viaBinding.status === 400 && (await viaBinding.json()).error === "invalid json", "a binding with member props passes the member's token gate (POST /internal-errata reaches body validation)", viaBinding.status);
  const publicCall = await mod.default.fetch(new Request(pub + "/internal-errata", { method: "POST", body: "{}", headers: { "X-Erratta-Token": "guess" } }), mkEnv(), {});
  ok(publicCall.status === 404, "the public host does not route /internal-errata to the member", publicCall.status);
  const badCaller = await mod.default.fetch(new Request("https://internal/internal-errata", { method: "POST", body: "not json" }), mkEnv(), { props: { caller: "evil", member: "errata-hub" } });
  ok(badCaller.status === 404, "props with a caller outside qnfo-* do not reach the member", badCaller.status);
}
ok(/\ncompatibility_flags = \["nodejs_compat"\]\n/.test(toml) && /\nsend_email = \[\n  \{ name = "SEND_EMAIL" \}\n\]\n/.test(toml) && /\n\[browser\]\nbinding = "BROWSER"\n/.test(toml), "wrangler.toml carries nodejs_compat, SEND_EMAIL and BROWSER for the member");
ok(existsSync(new URL("../errata-hub/FOLDED", import.meta.url)), "errata-hub carries a FOLDED marker");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
