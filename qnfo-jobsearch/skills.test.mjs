// JOBSEARCH-SKILLS-1 (owner 2026-11-10: "the skills required to build this are the skills that should be on my resume"). Run: node qnfo-jobsearch/skills.test.mjs
// Proves: the skills the record backs reach the CV bank once; each skill the record cannot back is one tap card in owner_asks (fleet.qnfo.org/focus);
// a tap there writes the card's own sentence into the CV, a no removes it, a tap on jobs.q08.org is mirrored back, and /api/cv-skills lists what was confirmed.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const T = w.__test;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(here, "../migrations/2026-10-27-jobsearch.sql"), "utf8"));
db.exec("CREATE TABLE owner_asks (id INTEGER PRIMARY KEY AUTOINCREMENT, plane TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, question TEXT NOT NULL, cue TEXT, options_json TEXT NOT NULL, priority INTEGER DEFAULT 5, created_at TEXT, answered_at TEXT, answer TEXT, answer_label TEXT, answered_via TEXT, UNIQUE(kind, ref))");
const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
  first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }) });
const env = { JOBS_DB: { prepare: (s) => stmt(s), batch: async (a) => { for (const x of a) await x.run(); return []; } }, LOOP_TOKEN: "secret-test-token" };
globalThis.fetch = async () => new Response(JSON.stringify({ jobs: [] }), { status: 200 });
const pending = [];
const ctxStub = { waitUntil: (p) => { pending.push(Promise.resolve(p).catch(() => {})); return p; } };
const settle = async () => { while (pending.length) await Promise.all(pending.splice(0)); };
const call = async (path, init) => { const r = await w.fetch(new Request("https://x" + path, init), env, ctxStub); return [r.status, await r.json().catch(() => null)]; };
const H = { "x-loop-token": "secret-test-token", "content-type": "application/json" };

// wording: systems design and direction, never coding; no mechanism named in the unfiled patent (ultrastable docs/CONFIDENTIALITY.md)
const asks = T.RECALL_SEED.filter((s) => s.ask);
const words = JSON.stringify([T.ULTRASTABLE_SKILL_FACTS, T.ULTRASTABLE_SKILLS, asks]).toLowerCase();
ok(!/\b(engineer|developer|coder|programmer|full-stack)\b/.test(words), "no skill or card calls Rowan an engineer, developer or coder");
ok(!/trust ledger|plussing|priority function|interrupt gate|patent pending|filed patent/.test(words), "no mechanism from the unfiled patent, no filed-patent claim");
ok(asks.length >= 8 && asks.every((s) => s.yes && s.skill && s.cue && /\?$/.test(s.ask)), "every card has a question, a concrete cue, the sentence a yes saves and the skill it adds");
ok(asks.every((s) => T.skillAskOptions(s).length >= 3 && T.skillAskOptions(s).length <= 5 && T.skillAskOptions(s).some((o) => o.key === "unsure")), "cards are 2 to 4 taps plus Not sure");

// evidenced skills reach the bank once
const seed = JSON.parse(JSON.stringify(T.getBank()));
const b1 = T.ultrastableSkillsBank(JSON.parse(JSON.stringify(seed))), b2 = T.ultrastableSkillsBank(JSON.parse(JSON.stringify(b1)));
ok(b1.facts.length === seed.facts.length + T.ULTRASTABLE_SKILL_FACTS.length && b2.facts.length === b1.facts.length && b2.skills.length === b1.skills.length, "evidenced facts and skills are added once");
ok(T.ULTRASTABLE_SKILLS.every(([n]) => b1.skills.some((k) => k.name === n)), "every evidenced skill is on the CV");

// the run seeds the cards and the bank
await w.scheduled({}, env, ctxStub); await settle();
const rows = db.prepare("SELECT * FROM owner_asks WHERE kind='cv-skill' ORDER BY id").all();
ok(rows.length === asks.length && rows.every((r) => r.plane === "jobs" && JSON.parse(r.options_json).length >= 3), "one owner_asks card per unbacked skill", rows.length);
let st = (await call("/api/cv", { headers: H }))[1];
ok(T.ULTRASTABLE_SKILL_FACTS.every(([t]) => st.facts.some((f) => f.text === T.polishProse(t) && f.status === "verified")), "the evidenced facts are in the live bank");

// taps on fleet.qnfo.org/focus reach the CV
let tick = 1;
const tap = (ref, key, label) => db.prepare("UPDATE owner_asks SET answer=?, answer_label=?, answered_at=?, answered_via='fleet.qnfo.org/focus' WHERE kind='cv-skill' AND ref=?").run(key, label, new Date(Date.now() + (tick++)).toISOString(), ref);
tap("red_team", "yes", "Yes"); tap("eu_ai_act", "no", "No"); tap("people_mgmt", "R05", "Yes, at AARP");
let r = await T.syncSkillAsks(env);
ok(r.applied === 3, "three focus taps applied", r);
st = (await call("/api/cv", { headers: H }))[1];
const red = asks.find((s) => s.id === "red_team"), ppl = asks.find((s) => s.id === "people_mgmt"), eu = asks.find((s) => s.id === "eu_ai_act");
ok(st.facts.some((f) => f.text === red.yes && f.status === "verified") && st.skills.some((k) => k.name === red.skill), "a yes writes the card's sentence and its skill", st.skills.map((k) => k.name));
ok(st.facts.some((f) => f.text === ppl.yes && f.role === "R05"), "a 'Yes, at AARP' tap files the fact under the AARP role");
ok(!st.facts.some((f) => f.text === eu.yes) && !st.skills.some((k) => k.name === eu.skill), "a no adds nothing");
ok((await T.syncSkillAsks(env)).applied === 0, "a tap is applied once");

// a change of mind removes what the old yes added
tap("red_team", "no", "No"); await T.syncSkillAsks(env);
st = (await call("/api/cv", { headers: H }))[1];
ok(!st.facts.some((f) => f.text === red.yes) && !st.skills.some((k) => k.name === red.skill), "a later no removes the fact and the skill");

// a tap on jobs.q08.org goes back to the card, so it is not asked twice
const [s1] = await call("/api/recall/answer", { method: "POST", headers: H, body: JSON.stringify({ key: "seed:prompt_design", answer: "yes", role: "R01", depth: "led" }) });
ok(s1 === 200, "answer on jobs.q08.org");
r = await T.syncSkillAsks(env);
const pd = db.prepare("SELECT answer, answered_via FROM owner_asks WHERE ref='prompt_design'").get();
ok(r.mirrored === 1 && pd.answer === "yes" && pd.answered_via === "jobs.q08.org", "the jobs tap closes the focus card", pd);

// not sure comes back after the rest period
db.prepare("UPDATE owner_asks SET answer='unsure', answer_label='Not sure', answered_at='2026-01-01T00:00:00Z' WHERE ref='venture_plan'").run();
r = await T.syncSkillAsks(env);
ok(r.reopened === 1 && db.prepare("SELECT answer FROM owner_asks WHERE ref='venture_plan'").get().answer === null, "Not sure is asked again later");

// the open read for rwnq8/resume
const [cs, body] = await call("/api/cv-skills");
ok(cs === 200 && body.schema_version === "cv-skills/v1" && body.confirmed.some((c) => c.key === "prompt_design") && body.confirmed.some((c) => c.key === "people_mgmt") && !body.confirmed.some((c) => c.key === "red_team"), "/api/cv-skills lists only confirmed yes answers", body.confirmed);
ok(body.evidenced.length === T.ULTRASTABLE_SKILL_FACTS.length && body.open_questions.includes("ip_strategy"), "it lists the evidenced facts and the open cards");

console.log(`qnfo-jobsearch skills: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
