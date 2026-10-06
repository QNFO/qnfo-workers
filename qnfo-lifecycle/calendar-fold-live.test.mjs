// CALENDAR-FOLD-2 integration suite (qnfo-lifecycle 1.9.0): the real folded bundle, not a mocked member. In-memory SQLite D1.
// Proves: GET /calendar/health answers as calendar-api 0.7.5-folded and reports feedback_links true from the key the fold kit
// derives from CF_API_TOKEN (HMAC-SHA256 over "fold-kit|calendar-api|CAL_KEY_SEED"), never from a copied CAL_TOKEN; the personal
// feed carries links on the host route signed with that key; GET /calendar/e/<id>?s=<sig> shows the page with a relative form
// action and the POST records the answer; a link signed with any other key is refused; personal-api's binding (props.member
// calendar-api, caller personal-api) is authorized, a caller outside the list reaches the host, and the host secret never
// appears in a response.
// Run: node --no-warnings qnfo-lifecycle/calendar-fold-live.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const stubbed = src.replace(/^import \{([^}]*)\} from "cloudflare:[^"]+";$/gm, (_, names) => names.split(",").map((n) => n.trim()).filter(Boolean).map((n) => { const p = n.split(/\s+as\s+/); return "function " + (p[1] || p[0]).trim() + "() {}"; }).join("\n"));
const mod = await import("data:text/javascript;base64," + Buffer.from(stubbed).toString("base64"));
const W = mod.default;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

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
const CF = "cf-api-token-for-test";
const env = {
  QNFO_AUDIT: { prepare: (sql) => stmtOn(sql), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } },
  ICS_R2: { async put() {}, async delete() {} },
  CF_API_TOKEN: CF
};
const HOST = "https://qnfo-lifecycle.q08.workers.dev";
const seed = createHmac("sha256", CF).update("fold-kit|calendar-api|CAL_KEY_SEED").digest("hex");
const sig = (key, id) => createHmac("sha256", "calendar-feedback|" + key).update("fb|" + id).digest("hex").slice(0, 24);

const h = await W.fetch(new Request(HOST + "/calendar/health"), env, {});
const hj = await h.json();
ok(h.status === 200 && hj.worker === "calendar-api" && hj.version === "0.7.5-folded", "GET /calendar/health answers as calendar-api 0.7.5-folded", hj.version);
ok(hj.feedback_links === true, "the member has a feedback key (derived from CF_API_TOKEN)", hj.feedback_links);
ok(!JSON.stringify(hj).includes(CF) && !JSON.stringify(hj).includes(seed), "neither the host secret nor the derived key appears in /health");

db.prepare("INSERT INTO calendar (plane, uid, title, location, dtstart, source, status) VALUES ('personal','lf1@x','Bimhuis: Jam','Bimhuis','2099-10-13T22:00:00+02:00','personal-twin','tentative')").run();
const id = db.prepare("SELECT id FROM calendar WHERE uid='lf1@x'").get().id;

const feed = await W.fetch(new Request("https://internal/events.ics?plane=personal&from=2099-01-01"), env, { props: { member: "calendar-api", caller: "personal-api" } });
const ft = await feed.text();
ok(feed.status === 200 && ft.includes("URL:" + HOST + "/calendar/e/" + id + "?s=" + sig(seed, id)), "personal-api's binding reads the personal feed; its links are on the host route, signed with the derived key", ft.match(/URL:\S+/));

const g = await W.fetch(new Request(HOST + "/calendar/e/" + id + "?s=" + sig(seed, id)), env, {});
const gh = await g.text();
ok(g.status === 200 && gh.includes('action="?s=' + sig(seed, id) + '"'), "GET /calendar/e/<id> shows the page with a relative form action", g.status);
const p = await W.fetch(new Request(HOST + "/calendar/e/" + id + "?s=" + sig(seed, id), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=keep" }), env, {});
ok(p.status === 200 && db.prepare("SELECT status FROM calendar WHERE id=?").get(id).status === "confirmed", "POST /calendar/e/<id> records the answer", p.status);
const bad = await W.fetch(new Request(HOST + "/calendar/e/" + id + "?s=" + sig(CF, id)), env, {});
ok(bad.status === 403, "a link signed with another key is refused", bad.status);

const q = await W.fetch(new Request(HOST + "/calendar/events.ics?plane=qnfo"), env, {});
ok(q.status === 200 && (await q.text()).includes("BEGIN:VCALENDAR"), "the public qnfo feed is served at /calendar/events.ics");
const pp = await W.fetch(new Request(HOST + "/calendar/events.ics?plane=personal", { headers: { Authorization: "Bearer " + seed } }), env, {});
ok(pp.status === 401, "the personal feed stays closed to the public, even with the derived key as a bearer", pp.status);
const evil = await W.fetch(new Request("https://internal/events?plane=personal"), env, { props: { member: "calendar-api", caller: "evil-worker" } });
ok(!(evil.headers.get("content-type") || "").includes("json") || !(await evil.text()).includes("Bimhuis"), "a caller outside qnfo-* and the named list does not reach the member", evil.status);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
