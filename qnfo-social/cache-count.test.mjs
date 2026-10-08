// PROMPT-CACHE-COUNT-3b (issue 2114): qnfo-social aiRunAttr writes ai_cache_counters in the live qnfo-audit schema (the 0.8.3
// write named columns the table lacks and failed silently). Driven against node:sqlite with the production table DDL.
// Run: node qnfo-social/cache-count.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf('var AI_ATTR_DB_BINDINGS = ["DB"];');
const b = src.indexOf("// end aiRunAttr");
if (a < 0 || b < 0) throw new Error("aiRunAttr block not found");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b) + "\n__export = { aiRunAttr };", sandbox);
const { aiRunAttr } = sandbox.__export;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const errors = [];
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE ai_cache_counters (day TEXT, worker TEXT, model TEXT, calls INTEGER DEFAULT 0, cached_calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, cached_tok INTEGER DEFAULT 0, PRIMARY KEY (day, worker, model))");
const D1 = { prepare(sql) { let args = []; const st = { bind(...x) { args = x; return st; }, async run() { try { db.prepare(sql).run(...args); } catch (e) { errors.push(String(e.message)); throw e; } return { success: true }; } }; return st; } };
const settle = () => new Promise((r) => setTimeout(r, 20));

const res = { response: "post", usage: { prompt_tokens: 2000, prompt_tokens_details: { cached_tokens: 1024 } } };
const out = await aiRunAttr({ DB: D1, AI: { run: async () => res } }, "qnfo-social", "compose", "@cf/deepseek-ai/deepseek-v4-flash-0731", { messages: [] });
ok(out === res, "returns the AI result unchanged");
await aiRunAttr({ DB: D1, AI: { run: async () => ({ response: "ok", usage: { prompt_tokens: 300 } }) } }, "qnfo-social", "repair", "@cf/deepseek-ai/deepseek-v4-flash-0731", { prompt: "p" });
await settle();
ok(errors.length === 0, "no SQL errors against the live schema: " + errors.join("; "));
const row = db.prepare("SELECT * FROM ai_cache_counters WHERE worker='qnfo-social'").get();
ok(row && row.calls === 2 && row.cached_calls === 1 && row.in_tok === 2300 && row.cached_tok === 1024, "row summed per (day, worker, model): " + JSON.stringify(row));
await aiRunAttr({ DB: D1, AI: { run: async () => ({ data: [] }) } }, "qnfo-social", "embed", "@cf/baai/bge-m3", { text: ["x"] });
await settle();
ok(db.prepare("SELECT COUNT(*) n FROM ai_cache_counters").get().n === 1, "embedding calls are not counted");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
