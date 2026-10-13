// Q08-TICK-BUDGET-1 (0.17.4, agent_issues 2479): every early exit of generate() writes an engine_runs row, the essay after a failed
// forecast waits for the next tick when the tick is mostly used, and repair rounds stop at a tick deadline.
import { DatabaseSync } from "node:sqlite";
const mod = await import("./worker.js");
const G = mod.__gen;
let passes = 0, fails = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x) : "")); } };
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT DEFAULT (datetime('now')), signals_scraped INT, signals_scored INT, piece_published INT, top_signal TEXT, model TEXT, ms INT, status TEXT, error TEXT)");
db.exec("CREATE TABLE published_pieces (id TEXT, slug TEXT, published_at TEXT)");
const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => { db.prepare(sql).run(...a); return { meta: {} }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; } };
const today = new Date().toISOString().slice(0, 10);
for (let i = 0; i < 12; i++) db.prepare("INSERT INTO published_pieces VALUES (?, ?, ?)").run("p" + i, "s" + i, today + "T01:00:00.000Z");
const out = await G.generate({ DB: shim });
const row = db.prepare("SELECT status, error, piece_published FROM engine_runs ORDER BY id DESC LIMIT 1").get();
check("a daily-cap exit returns its reason", out && out.ok === false && /daily cap reached/.test(out.reason), out);
check("and writes an engine_runs row with status skipped", row && row.status === "skipped" && /daily cap reached/.test(row.error) && row.piece_published === 0, row);
const src = (await import("node:fs")).readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const gen = src.slice(src.indexOf("async function generate(env) {"), src.indexOf("  // Few-shot only from pieces with proven reader value"));
check("no early exit in generate() returns without a row", !/return \{ ok: false, reason: (?!reason)/.test(gen));
check("the essay after a failed forecast is deferred when the tick is mostly used", /if \(Date\.now\(\) - t0 > ESSAY_AFTER_FORECAST_MS\) return await quit\("deferred"/.test(gen) && G.ESSAY_AFTER_FORECAST_MS === 240000);
check("repair rounds stop at the tick deadline", /if \(a\.deadline && Date\.now\(\) > a\.deadline\)/.test(src) && /deadline: t0 \+ TICK_BUDGET_MS/.test(src) && G.TICK_BUDGET_MS <= 780000);
check("skipped and deferred rows are not counted as stalled runs", /status NOT IN \('running','abandoned','async-done','skipped','deferred'\) ORDER BY id DESC LIMIT 3/.test(src));
check("the gate pass rate does not count skipped or deferred rows", /FROM engine_runs WHERE ran_at >= datetime\('now','-7 days'\) AND status NOT IN \('running','abandoned','async-done','skipped','deferred'\)/.test(src));
check("the attempt cap still counts only ok and gate_failed", /status IN \('ok','gate_failed'\)/.test(src));
// a repair that starts after the deadline stops at once and says so
const V = mod.__verify;
const essay = "# The queue nobody measured\n\n" + Array(8).fill("The operator watched the queue grow while the dashboard stayed green, because it measured the database and not the disk under it.").join("\n\n") + "\n\nworth your time: yes - x";
const env = { AI: { run: async () => ({ response: JSON.stringify({ unsupported: ["nothing that occurs in the draft at all here -- x"], verdict: "fail" }) }) } };
const r = await V.verifyAndRevise(env, { piece: { text: essay, model: "@cf/openai/gpt-oss-120b" }, prompt: "P", banned: [], ground: essay, seedText: "s", forecast: false, deadline: Date.now() - 1 });
check("a repair past the tick deadline stops and names it in the trail", r.ok === false && r.problems.some((p) => /stopped: the tick budget is spent/.test(p)), r.problems);
console.log("tick-budget.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
