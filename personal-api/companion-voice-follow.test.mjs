// personal-api/companion-voice-follow.test.mjs (COMPANION-VOICE-2, COMPANION-FOLLOW-1, owner 2026-11-14)
// 1. the page has ONE recorder: permission "blocked" comes only from getUserMedia, speech goes to the server (Whisper), outcomes are reported;
// 2. "I like Concerto and similar free events, put them on my calendar and remind me" is a standing rule decided by code and applied to the For you feed.
// Run: node personal-api/companion-voice-follow.test.mjs
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import * as C from "./companion.js";
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const src = fs.readFileSync(new URL("./companion.js", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");

console.log("\n[one recorder]");
const v3 = C.PAGE_V3 ? C.PAGE_V3 : "";
ok("page v3 is exported or served", v3.length > 1000 || /PAGE_V3/.test(src));
ok("source defines the shared recorder", /function micStart\(btn,h\)/.test(src) && /function micText\(blob\)/.test(src));
ok("recorder asks permission through getUserMedia only", /getUserMedia\(\{audio:\{echoCancellation/.test(src));
ok("SpeechRecognition is only the last resort", /function micSpeech\(/.test(src) && !/if\(SR\)\{var r=new SR\(\)/.test(src));
ok("not-allowed from speech service is not the Ask's blocked path", !/err==='not-allowed'\|\|err==='service-not-allowed'\)\{blocked/.test(src));
ok("outcomes are reported", /\/companion\/api\/mic-event/.test(src) && /cmp_mic_events/.test(src));
ok("silence detector stops the recording", /now-lastVoice>1800/.test(src));
ok("classic page uses the shared core", /__MIC_JS__/.test(src) && /function qcMic\(\)\{var mic=\$\('qc-mic'\);micStart/.test(src));

console.log("\n[follow intent]");
const i = C.followIntent("I like concerto and similar free events and want them on my calendar and to be reminded automatically");
ok("Concerto request is a follow rule", i && /concerto/i.test(i.topic) && i.free === true, i);
ok("a weather question is not", C.followIntent("what's the weather like tomorrow") === null);
ok("no calendar word, no rule", C.followIntent("I like jazz") === null);
ok("worker retries an unusable action then decides by code", /COMPANION-ASK-RETRY-1/.test(worker) && /CMP\.followIntent\(q\)/.test(worker));

console.log("\n[follow rule puts matching events on the calendar]");
const db = new DatabaseSync(":memory:");
const d1 = { prepare(sql) { let a = []; const api = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return api; },
  async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: r.changes } }; },
  async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) ?? null; } }; return api; } };
const env = { PERSONAL: d1 };
const day = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
db.exec("CREATE TABLE cmp_feed (id TEXT PRIMARY KEY, date TEXT NOT NULL, time TEXT, title TEXT NOT NULL, venue TEXT, kind TEXT, url TEXT, why TEXT, score REAL DEFAULT 0, state TEXT DEFAULT 'new', reason TEXT, built_at TEXT, shown INTEGER DEFAULT 0, shown_day TEXT)");
db.exec("CREATE TABLE cmp_feed_meta (k TEXT PRIMARY KEY, v TEXT)");
const ins = db.prepare("INSERT INTO cmp_feed (id, date, time, title, venue, kind, why) VALUES (?,?,?,?,?,?,?)");
ins.run("a", day, "17:00", "Free in-store set", "Concerto", "music", "record shop");
ins.run("b", day, "20:00", "Open stage", "Cafe Zeeuws", "music", "free entry");
ins.run("c", day, "21:00", "Paid opera", "Muziekgebouw", "music", "tickets 45 euro");
const added = [];
const deps = { calAdd: async (e, a) => { added.push(a.title); return { ok: true }; } };
let res;
try { res = await C.followAdd(env, deps, { topic: "Concerto and similar free events", free: true }); } catch (e) { res = { ok: false, error: String(e && e.stack || e) }; }
ok("rule saved", res && res.ok === true, res);
ok("venue match added", added.includes("Free in-store set"), added);
ok("free events elsewhere added", added.includes("Open stage"), added);
ok("paid event not added", !added.includes("Paid opera"), added);
ok("added cards leave the feed", db.prepare("SELECT state FROM cmp_feed WHERE id='a'").get().state === "saved");
const again = await C.followRun(env, deps);
ok("second run adds nothing twice", again.added === 0 && added.length === 2, again);
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
