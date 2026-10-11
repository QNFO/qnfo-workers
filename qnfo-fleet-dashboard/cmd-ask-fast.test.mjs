// CMD-ASK-FAST-1 offline suite (qnfo-fleet-dashboard 1.29.0). Proves: the command line races its models with a staggered
// start (a failed or silent first model never costs the whole budget, the first answer wins, every failure is named), the
// dead glm-5.2 id is gone, and a Q08 question reads published_pieces into the context and the no-model fallback, which says
// plainly when its stored data does not cover a question. Run: node qnfo-fleet-dashboard/cmd-ask-fast.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
ok(!/var ASK_MODELS = \[[^\]]*glm-5\.2/.test(src), "ASK_MODELS no longer names glm-5.2");
ok(/var ASK_MODELS = \["deepseek-v4-flash", "glm-5\.3-flash"/.test(src), "ASK_MODELS leads with deepseek-v4-flash then glm-5.3-flash");
ok(/\[\[d1_databases\]\]\s*binding = "Q08"/.test(readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8")), "wrangler.toml declares the Q08 read binding");

const helpers = cut("function squash(s) {", "__name(squash") + "\n" + cut("async function d1all(", "__name(d1all");
const race = cut("var ASK_MODELS = ", "async function sha256hex(").replace("var ASK_HEDGE_MS = 5e3;", "var ASK_HEDGE_MS = 150;")
  + "\n" + cut("// CMD-ASK-FAST-1: race the models", "// One plain-English answer: models raced")
  + "\n" + cut("// One model call with a real abort", "// One plain-English answer: models raced");
const q08 = cut("var Q08_Q = ", "async function cmdAnswer(");
const fb = cut("function cmdModelReason(err) {", "// What the owner reads for a request that has no answer at all");
const mk = (svc) => { const sb = { AbortController, setTimeout, clearTimeout, Date, JSON, Math, String, Promise, Array, Object, Error, RegExp }; vm.createContext(sb);
  vm.runInContext(helpers + "\n" + race + "\n" + q08 + "\n" + fb + "\n__f = { cmdRaceModels, ASK_MODELS, q08Facts, q08FactsText, cmdFallback, Q08_Q };", sb); return sb.__f; };
const resp = (status, content) => ({ ok: status === 200, status, json: async () => ({ choices: [{ message: { content } }] }) });
const env = (fn, calls) => ({ SVC_QNFO_AI: { fetch: async (u, o) => { const m = JSON.parse(o.body).model; calls.push(m); return fn(m, o); } } });

{ // first model fails fast (the dead-id case): the second answers at once, no 13 s wait
  const calls = [], f = mk();
  const t0 = Date.now();
  const r = await f.cmdRaceModels(env((m) => m === "deepseek-v4-flash" ? resp(404, "") : resp(200, "answer from " + m), calls), [{ role: "user", content: "q" }], 5000);
  ok(r.ok && r.model === "glm-5.3-flash" && Date.now() - t0 < 1500 && calls.length === 2, "a failed first model hands over to the second immediately", { r, calls });
}
{ // first model silent: the hedge starts the second, which wins; the silent one is aborted by its own timer later
  const calls = [], f = mk();
  const t0 = Date.now();
  const r = await f.cmdRaceModels(env((m, o) => m === "deepseek-v4-flash" ? new Promise((res, rej) => o.signal.addEventListener("abort", () => rej(new Error("aborted")))) : resp(200, "fast " + m), calls), [{ role: "user", content: "q" }], 6000);
  ok(r.ok && r.model === "glm-5.3-flash" && Date.now() - t0 < 1200, "a silent first model does not hold the answer past the hedge delay", { r, ms: Date.now() - t0 });
}
{ // all fail: every model is named in the error
  const calls = [], f = mk();
  const r = await f.cmdRaceModels(env(() => resp(500, ""), calls), [{ role: "user", content: "q" }], 5000);
  ok(!r.ok && f.ASK_MODELS.every((m) => r.error.includes(m)) && calls.length === f.ASK_MODELS.length, "an all-fail race names every model", r);
}

// Q08 facts and the fallback
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE published_pieces (id TEXT, slug TEXT, title TEXT, published_at TEXT); CREATE TABLE engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT, status TEXT, piece_published INTEGER)");
db.prepare("INSERT INTO published_pieces VALUES ('a','2026-10-10-x','Piece X','2026-10-10T06:04:59Z'),('b','2026-10-09-y','Piece Y','2026-10-09T22:04:39Z')").run();
db.prepare("INSERT INTO engine_runs (ran_at,status,piece_published) VALUES ('2026-10-10 06:00:00','ok',1)").run();
const d1 = { prepare: (sql) => { const st = db.prepare(sql); return { all: async () => ({ results: st.all() }) }; } };
{
  const f = mk();
  ok(f.Q08_Q.test("Where are Q08 posts/content?") && !f.Q08_Q.test("status"), "Q08 questions are recognised");
  const q = await f.q08Facts({ Q08: d1 });
  ok(q.site === "reading.q08.org" && q.published_total === 2 && q.recent[0].slug === "2026-10-10-x" && q.last_engine_run.status === "ok", "q08Facts reads counts, recent pieces and the last engine run", q);
  const txt = f.q08FactsText(q);
  ok(/reading\.q08\.org/.test(txt) && /2 pieces/.test(txt) && /Piece X/.test(txt), "q08FactsText answers where the posts are", txt);
  ok((await f.q08Facts({})).error === "q08 store not bound", "an unbound store is reported, not thrown");
  const fbq = f.cmdFallback({ v: null, q08: q }, "glm: timeout 13s");
  ok(/reading\.q08\.org/.test(fbq) && !/does not cover this question/.test(fbq), "the fallback answers a Q08 question from the stored facts", fbq);
  const fbn = f.cmdFallback({ v: null }, "x");
  ok(/does not cover this question/.test(fbn), "a question with no topical facts is told so plainly", fbn);
}
console.log(fail ? fail + " failed" : pass + " passed");
if (fail) process.exit(1);
