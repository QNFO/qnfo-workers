// TP-7 lever 1 offline suite (qnfo-ai-search 2.2.6, TRANSFORMATION-PROGRAM-1 T7.1, agent_issues 2015): the ask.qwav.tech page
// carries a subscribe box (type="email" plus a honeypot) whose script posts cross-origin to the qnfo.org double opt-in with
// source ask.qwav.tech. The page is evaluated from the PAGE template literal exactly as the worker serves it, and the served
// script is run against a minimal DOM, so template-literal escaping cannot silently break the client code.
// Run: node --no-warnings qnfo-ai-search/subscribe-box.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("var PAGE = `"), b = src.indexOf("\n`;", a);
if (a < 0 || b < a) throw new Error("PAGE template literal not found in worker.js");
const PAGE = vm.runInNewContext(src.slice(a + "var PAGE = ".length, b + 2));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };

ok(/type=["']email["']/i.test(PAGE), "the page carries an email input (the REACH-IDEATION-1 subscribe-box check)");
ok(/id="ask-sub-form"/.test(PAGE) && /id="ask-sub-email"/.test(PAGE), "subscribe form and email field present");
ok(/id="ask-sub-hp"[^>]*tabindex="-1"/.test(PAGE), "honeypot field present and out of the tab order");
ok(/double opt-in/i.test(PAGE) && /unsubscribe/i.test(PAGE), "the box says it is double opt-in with an unsubscribe link");
const m = PAGE.match(/<script>\(function\(\)\{var f=document\.getElementById\('ask-sub-form'\)[\s\S]*?<\/script>/);
ok(!!m, "the subscribe script is served");
const code = m ? m[0].replace(/^<script>/, "").replace(/<\/script>$/, "") : "";

function run(email, hp, respond) {
  const els = {
    "ask-sub-form": { listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; }, reset() { els["ask-sub-email"].value = ""; } },
    "ask-sub-msg": { textContent: "" },
    "ask-sub-btn": { disabled: false },
    "ask-sub-email": { value: email },
    "ask-sub-hp": { value: hp }
  };
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return respond(); };
  vm.runInNewContext(code, { document: { getElementById: (id) => els[id] || null }, fetch, JSON, Promise });
  els["ask-sub-form"].listeners.submit({ preventDefault() {} });
  return { els, calls };
}
const settle = () => new Promise((r) => setTimeout(r, 20));

let t = run("  reader@example.org ", "", async () => ({ json: async () => ({ ok: true, pending: true }) }));
await settle();
ok(t.calls.length === 1 && t.calls[0].url === "https://qnfo.org/api/subscribe" && t.calls[0].init.method === "POST", "posts to the qnfo.org double opt-in", t.calls[0] && t.calls[0].url);
const body = t.calls.length ? JSON.parse(t.calls[0].init.body) : {};
ok(body.email === "reader@example.org" && body.source === "ask.qwav.tech" && body.hp === "", "email trimmed, source ask.qwav.tech, empty honeypot passed", body);
ok(/confirm/i.test(t.els["ask-sub-msg"].textContent) && t.els["ask-sub-email"].value === "" && t.els["ask-sub-btn"].disabled === false, "success message, form reset, button re-enabled");

t = run("not-an-address", "", async () => ({ json: async () => ({ ok: true }) }));
await settle();
ok(t.calls.length === 0 && /valid email/i.test(t.els["ask-sub-msg"].textContent), "a bad address is refused in the page and never sent");

t = run("bot@example.org", "spam", async () => ({ json: async () => ({ ok: true, pending: true }) }));
await settle();
ok(t.calls.length === 1 && JSON.parse(t.calls[0].init.body).hp === "spam", "a filled honeypot is passed on so qnfo-subscribers drops it silently");

t = run("x@example.org", "", async () => ({ json: async () => ({ ok: false, error: "Please enter a valid email address." }) }));
await settle();
ok(t.els["ask-sub-msg"].textContent === "Please enter a valid email address." && t.els["ask-sub-btn"].disabled === false, "a refusal from the service is shown");

t = run("x@example.org", "", async () => { throw new Error("offline"); });
await settle();
ok(/network error/i.test(t.els["ask-sub-msg"].textContent) && t.els["ask-sub-btn"].disabled === false, "a network failure is shown and the button re-enabled");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
