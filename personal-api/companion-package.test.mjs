// personal-api/companion-package.test.mjs (COMPANION-PACKAGE-1, rules 25 and 26)
// Run: node personal-api/companion-package.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import * as C from "./companion.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra).slice(0, 400) : "")); }
};
function d1(db) {
  return { prepare(sql) { let args = []; const api = {
    bind(...a) { args = a.map((x) => (x === undefined ? null : x)); return api; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) ?? null; } }; return api; } };
}
const raw = new DatabaseSync(":memory:");
const env = { PERSONAL: d1(raw) };
await C.ensureSchema(env.PERSONAL, true);
const cfg = (k) => { const r = raw.prepare("SELECT value FROM wellbeing_config WHERE key = ?").get(k); return r ? JSON.parse(r.value) : null; };
const deps = (iso) => ({ nowIso: iso, embed: async (e, t) => t.map(() => new Array(768).fill(0.01)) });

console.log("\n[the one-page guide (rule 25)]");
{
  const r = await C.handleCompanion(new Request("https://me.q08.org/companion/guide"), env, {}, { auth: async () => false, version: "t" });
  const h = await r.text();
  ok("guide: served without sign-in", r.status === 200 && /text\/html/.test(r.headers.get("Content-Type")));
  ok("guide: no script, no personal data, scripts blocked by CSP", !/<script/i.test(h) && /script-src 'none'/.test(r.headers.get("Content-Security-Policy")));
  ok("guide: says what he asked for, the setup, a normal day, control, crisis lines and how it compares",
    ["What you asked for", "Set it up once", "A normal day", "in control", "113", "0800-0113", "112", "How it compares", "me.q08.org", "Add to Home Screen"].every((x) => h.includes(x)));
  ok("guide: no infrastructure words", !/workers\.dev|API key|Cloudflare|D1|bearer|token/i.test(h));
  const w = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  ok("guide: me.q08.org/guide and /help lead to it", /me\.q08\.org" && \(path === "\/guide" \|\| path === "\/help"\)\) return Response\.redirect\("https:\/\/me\.q08\.org\/companion\/guide"/.test(w));
}

console.log("\n[start here (rule 25)]");
{
  const t0 = await C.today(env, {});
  ok("today: reports no mood yet and no phone set up", t0.mood_ever === false && t0.push_ready === false, { m: t0.mood_ever, p: t0.push_ready });
  raw.prepare("INSERT INTO cmp_mood (id, ts, day, score) VALUES ('m1', ?, ?, 3)").run(new Date().toISOString(), new Date().toISOString().slice(0, 10));
  ok("today: the first mood tick shows up", (await C.today(env, {})).mood_ever === true);
  raw.prepare("DELETE FROM cmp_mood").run();
  const page = C.PAGE_HTML;
  ok("page: Start here lists home screen, notifications, first check-in and safety plan, links the guide and can be hidden",
    page.includes("function startHere") && ["Put me on your home screen", "Turn on notifications", "Tell me how you are today", "Write your safety plan", "/companion/guide", "cmp-start-hidden"].every((x) => page.includes(x)));
  ok("page: the old notifications card stays away while Start here shows", page.includes("if(!t.push_ready&&!startShown)"));
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  let parsed = true; try { new Function(script); } catch (e) { parsed = false; }
  ok("page: script still parses", parsed);
}

console.log("\n[the chat he already uses (rule 26)]");
{
  const morning = "2026-10-21T08:30:00Z"; // 10:30 in Amsterdam
  let c = await C.chatContext(env, deps(morning), "what's on tonight?", false);
  ok("chat: asks once how he is when no mood is logged", /CHECK-IN \(once today\)/.test(c) && /cmp_mood/.test(c), c);
  ok("chat: mentions me.q08.org while no phone is set up", /SETUP NOTE/.test(c) && /me\.q08\.org/.test(c));
  ok("chat: both are remembered for the day", cfg("chat_checkin_day") === "2026-10-21" && cfg("chat_setup_hint_day") === "2026-10-21");
  c = await C.chatContext(env, deps("2026-10-21T10:00:00Z"), "and tomorrow?", false);
  ok("chat: not asked twice the same day", !/CHECK-IN/.test(c) && !/SETUP NOTE/.test(c), c);
  c = await C.chatContext(env, deps("2026-10-22T08:30:00Z"), "hi", false);
  ok("chat: asked again the next day, setup note waits three days", /CHECK-IN/.test(c) && !/SETUP NOTE/.test(c));
  c = await C.chatContext(env, deps("2026-10-24T08:30:00Z"), "hi", false);
  ok("chat: setup note again after three days", /SETUP NOTE/.test(c));
  c = await C.chatContext(env, deps("2026-10-25T08:30:00Z"), "hi", true);
  ok("chat: inside the app, no setup note", !/SETUP NOTE/.test(c));
  raw.prepare("DELETE FROM wellbeing_config WHERE key IN ('chat_checkin_day', 'chat_setup_hint_day')").run();
  c = await C.chatContext(env, deps("2026-10-26T08:30:00Z"), "I can't cope anymore", false);
  ok("chat: no check-in or setup note when he sounds worn down", !/CHECK-IN/.test(c) && !/SETUP NOTE/.test(c) && /CARE/.test(c), c);
  raw.prepare("INSERT INTO cmp_mood (id, ts, day, score) VALUES ('m2', '2026-10-27T07:00:00Z', '2026-10-27', 4)").run();
  c = await C.chatContext(env, deps("2026-10-27T08:30:00Z"), "hi", false);
  ok("chat: no check-in once a mood is logged that day", !/CHECK-IN/.test(c));
  c = await C.chatContext(env, deps("2026-10-28T21:30:00Z"), "hi", false); // 22:30 local
  ok("chat: no check-in late at night", !/CHECK-IN/.test(c));
  raw.prepare("INSERT INTO cmp_push_subs (endpoint, p256dh, auth, created_at) VALUES ('https://push.example/x', 'k', 'a', '2026-10-28T00:00:00Z')").run();
  raw.prepare("DELETE FROM wellbeing_config WHERE key = 'chat_setup_hint_day'").run();
  c = await C.chatContext(env, deps("2026-10-29T08:30:00Z"), "hi", false);
  ok("chat: no setup note once a phone is set up", !/SETUP NOTE/.test(c) && /CHECK-IN/.test(c));
  raw.prepare("INSERT INTO wellbeing_config (key, value, updated_at) VALUES ('pause_until', ?, ?)").run(JSON.stringify("2099-01-01T00:00:00Z"), "x");
  raw.prepare("DELETE FROM wellbeing_config WHERE key = 'chat_checkin_day'").run();
  c = await C.chatContext(env, deps("2026-10-30T08:30:00Z"), "hi", false);
  ok("chat: a pause silences the check-in too", !/CHECK-IN/.test(c));
}
console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
