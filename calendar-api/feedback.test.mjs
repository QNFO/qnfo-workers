// calendar-api feedback suite (0.5.0, FEEDBACK-1, charter pillar: personal).
// Loads the real worker.js and drives its fetch handler against an in-memory SQLite D1 with a stubbed R2.
// Proves: a signed link shows the event without changing it (a link scanner cannot remove an event); only a POST changes
// it; "not for me" cancels and stores the reason; keep and went confirm; went stores who and a note; wrong or missing
// signatures, other ids, non-suggestion rows and bad input are refused; the personal feed carries the link on suggested
// events only; the stored feedback is readable only with the bearer token; text is HTML-escaped.
// Run: node calendar-api/feedback.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const W = mod.default;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

function makeEnv(token) {
  const db = new DatabaseSync(":memory:");
  function stmtOn(sql) {
    let args = [];
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
    };
    return s;
  }
  const puts = [];
  const env = {
    CAL_DB: { prepare: (sql) => stmtOn(sql), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } },
    ICS_R2: { async put(k, v) { puts.push({ k, v }); }, async delete() {} },
    CAL_TOKEN: token
  };
  return { db, env, puts };
}
const call = (env, method, path, opts) => W.fetch(new Request("https://calendar-api.q08.workers.dev" + path, Object.assign({ method }, opts || {})), env);
const form = (o) => ({ headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });
const sigOf = (u) => new URL(u).searchParams.get("s");

const T = makeEnv("test-token-123");
await call(T.env, "GET", "/health"); // ensureSchema
const ins = T.db.prepare("INSERT INTO calendar (plane, uid, title, location, dtstart, source, domain, relevance, friction, status, url, description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
ins.run("personal", "u1@x", "Rijksmuseum: Willem de Kooning <b>at work</b>", "Rijksmuseum", "2099-10-09", "personal-radar", "MUS", 6, 2, "tentative", null, "A show");
ins.run("personal", "u2@x", "Bimhuis: Tuesday Jam", "Bimhuis", "2099-10-13T22:00:00+02:00", "personal-twin", "JAZ", 5, 1, "confirmed", "https://bimhuis.nl/x", null);
ins.run("personal", "u3@x", "Hotel Perfect, Krakow", "Krakow, Poland", "2099-10-06T15:00:00+02:00", "manual", "travel", null, null, "confirmed", null, "Check-in");
ins.run("qnfo", "u4@x", "QNFO meeting", "online", "2099-10-10", "manual", null, null, null, "confirmed", null, null);
const idOf = (uid) => T.db.prepare("SELECT id FROM calendar WHERE uid=?").get(uid).id;
const id1 = idOf("u1@x"), id2 = idOf("u2@x"), id3 = idOf("u3@x");

// ---- the personal feed carries the link on suggestions only ----
const icsRes = await call(T.env, "GET", "/events.ics?plane=personal&from=2099-01-01", { headers: { Authorization: "Bearer test-token-123" } });
const ics = await icsRes.text();
ok(icsRes.status === 200 && ics.includes("BEGIN:VCALENDAR"), "authorised personal feed is served");
const link1 = "https://calendar-api.q08.workers.dev/e/" + id1 + "?s=";
ok(ics.includes("URL:" + link1), "a suggestion without its own url gets the feedback page as its URL");
ok(ics.includes("Not for me / keep / I went: " + link1.replace(/,/g, "\\,")), "the feedback link is also in the description");
ok(ics.includes("URL:https://bimhuis.nl/x") && ics.includes("/e/" + id2 + "?s="), "a suggestion with its own url keeps it as URL and still gets the link in the description");
ok(!ics.includes("/e/" + id3), "trip rows (source manual) get no feedback link");
const icsNoTok = makeEnv(undefined);
await call(icsNoTok.env, "GET", "/health");
icsNoTok.db.prepare("INSERT INTO calendar (plane, uid, title, dtstart, source) VALUES ('personal','n1@x','x','2099-01-01','personal-radar')").run();
const publish = await call(icsNoTok.env, "GET", "/events.ics?plane=personal", { headers: { Authorization: "Bearer x" } });
ok(publish.status === 401, "no CAL_TOKEN configured: the personal feed refuses (fail closed)");

// ---- GET shows, never changes ----
const sig1 = sigOf(link1 + ics.split(link1)[1].split(/[\\\r\n]/)[0]);
ok(/^[0-9a-f]{24}$/.test(sig1), "signature is 24 hex characters");
const g = await call(T.env, "GET", "/e/" + id1 + "?s=" + sig1);
const gh = await g.text();
ok(g.status === 200 && g.headers.get("content-type").startsWith("text/html"), "valid link shows the page");
ok(gh.includes("Interested, keep it") && gh.includes("I went") && gh.includes("Not for me, remove it"), "page offers the three choices");
ok(gh.includes("&lt;b&gt;at work&lt;/b&gt;") && !gh.includes("<b>at work</b>"), "event text is HTML-escaped");
ok(g.headers.get("cache-control") === "no-store" && /default-src 'none'/.test(g.headers.get("content-security-policy")), "page is not cached and has a strict CSP");
ok(T.db.prepare("SELECT status FROM calendar WHERE id=?").get(id1).status === "tentative", "GET alone does not change the event");
ok(T.db.prepare("SELECT count(*) c FROM calendar_feedback").get().c === 0, "GET alone stores no feedback");

// ---- refusals ----
ok((await call(T.env, "GET", "/e/" + id1 + "?s=" + "0".repeat(24))).status === 403, "wrong signature: 403");
ok((await call(T.env, "GET", "/e/" + id1)).status === 403, "missing signature: 403");
ok((await call(T.env, "GET", "/e/" + id2 + "?s=" + sig1)).status === 403, "a signature for one event does not open another");
const hmacFor = async (id) => { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode("calendar-feedback|test-token-123"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const m = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("fb|" + id)); return Array.from(new Uint8Array(m).slice(0, 12)).map((b) => b.toString(16).padStart(2, "0")).join(""); };
ok(sig1 === await hmacFor(id1), "signature is HMAC-SHA256(CAL_TOKEN) over the event id");
ok((await call(T.env, "GET", "/e/" + id3 + "?s=" + await hmacFor(id3))).status === 404, "a trip row is not a suggestion: 404 even with a valid signature");
ok((await call(T.env, "GET", "/e/9999?s=" + await hmacFor(9999))).status === 404, "unknown id: 404");
ok((await call(T.env, "PUT", "/e/" + id1 + "?s=" + sig1)).status === 405, "other methods: 405");
ok((await call(T.env, "POST", "/e/" + id1 + "?s=" + sig1, form({ a: "delete" }))).status === 400, "unknown action: 400");
ok(T.db.prepare("SELECT status FROM calendar WHERE id=?").get(id1).status === "tentative", "refusals leave the event unchanged");

// ---- keep ----
const putsBefore = T.puts.length;
const k = await call(T.env, "POST", "/e/" + id1 + "?s=" + sig1, form({ a: "keep" }));
ok(k.status === 200 && (await k.text()).includes("Kept."), "keep answers");
ok(T.db.prepare("SELECT status FROM calendar WHERE id=?").get(id1).status === "confirmed", "keep confirms a tentative suggestion");
ok(T.puts.length > putsBefore, "the feed is republished after a change");

// ---- not for me (with reason, then a bad reason) ----
const n = await call(T.env, "POST", "/e/" + id1 + "?s=" + sig1, form({ a: "nope", why: "bad-timing" }));
ok(n.status === 200 && (await n.text()).includes("Removed from your calendar"), "nope answers");
ok(T.db.prepare("SELECT status FROM calendar WHERE id=?").get(id1).status === "cancelled", "nope cancels (kept in the table, so the radar will not re-suggest it)");
let fb = T.db.prepare("SELECT * FROM calendar_feedback WHERE action='nope'").get();
ok(fb && fb.reason === "bad-timing" && fb.domain === "MUS" && fb.source === "personal-radar" && fb.cal_id === id1, "reason, domain and source are stored with the answer");
await call(T.env, "POST", "/e/" + id1 + "?s=" + sig1, form({ a: "nope", why: "<script>" }));
ok(T.db.prepare("SELECT reason FROM calendar_feedback WHERE action='nope' ORDER BY id DESC").get().reason === null, "an unknown reason is stored as null");
const icsAfter = await (await call(T.env, "GET", "/events.ics?plane=personal&from=2099-01-01", { headers: { Authorization: "Bearer test-token-123" } })).text();
ok(!icsAfter.includes("de Kooning"), "a cancelled suggestion drops out of the feed");

// ---- went (who and a note), caps ----
const wsig = await hmacFor(id2);
const w = await call(T.env, "POST", "/e/" + id2 + "?s=" + wsig, form({ a: "went", met: "Mira " + "x".repeat(200), note: "talked about field recordings" }));
ok(w.status === 200 && (await w.text()).includes("Logged that you went."), "went answers");
fb = T.db.prepare("SELECT * FROM calendar_feedback WHERE action='went'").get();
ok(fb && fb.met.startsWith("Mira ") && fb.met.length === 80 && fb.note === "talked about field recordings" && fb.synced_to_ledger === 0, "who is capped at 80 characters, the note is kept, ledger sync flag starts at 0");
ok(T.db.prepare("SELECT status FROM calendar WHERE id=?").get(id2).status === "confirmed", "went leaves the event confirmed");
await call(T.env, "POST", "/e/" + id2 + "?s=" + wsig, form({ a: "keep", met: "ignored", why: "bad-timing" }));
fb = T.db.prepare("SELECT * FROM calendar_feedback WHERE action='keep' ORDER BY id DESC").get();
ok(fb.met === null && fb.reason === null, "who and reason are stored only with went and nope");

// ---- feedback read API needs the bearer ----
ok((await call(T.env, "GET", "/feedback")).status === 401, "/feedback without a token: 401");
const fr = await call(T.env, "GET", "/feedback?limit=2", { headers: { Authorization: "Bearer test-token-123" } });
const fj = await fr.json();
ok(fr.status === 200 && fj.ok && fj.count === 2 && fj.feedback[0].id > fj.feedback[1].id, "/feedback returns the newest rows first, limited");

// ---- existing behaviour ----
const h = await (await call(T.env, "GET", "/health")).json();
ok(h.version === "0.5.0-feedback" && h.capabilities.includes("event-feedback") && h.capabilities.includes("ics-publish"), "health reports the new version and keeps the old capabilities");
ok((await call(T.env, "GET", "/events?plane=personal")).status === 401, "event reads still need the bearer");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
