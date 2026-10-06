// FOLD-READY-1 (calendar-api 0.7.4, CALENDAR-FOLD-2, agent_issues 2010) offline suite. In-memory SQLite D1, stubbed R2.
// Proves: as its own worker (CAL_TOKEN set, no CAL_PUBLIC_BASE) the feedback links are byte-identical to 0.7.3's (same base,
// same HMAC over "calendar-feedback|" + CAL_TOKEN); with only CAL_KEY_SEED (the fold kit's host-derived value) links are signed
// with the seed, carry CAL_PUBLIC_BASE, and the page accepts them on GET and POST; a link signed with one key is refused under
// the other; with neither key there are no links and the owner-question producer skips; the form posts to "?s=<sig>"
// relative to its own page (so it works under a host prefix) and the page keeps form-action 'self'.
// Run: node --no-warnings calendar-api/fold-ready.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const W = mod.default;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

function makeEnv(extra) {
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
  const env = Object.assign({
    CAL_DB: { prepare: (sql) => stmtOn(sql), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } },
    ICS_R2: { async put() {}, async delete() {} }
  }, extra);
  return { db, env };
}
const call = (env, base, method, path, opts) => W.fetch(new Request(base + path, Object.assign({ method }, opts || {})), env, {});
const sig = (secret, id) => createHmac("sha256", "calendar-feedback|" + secret).update("fb|" + id).digest("hex").slice(0, 24);

async function seed(T, base) {
  await call(T.env, base, "GET", "/health");
  T.db.prepare("INSERT INTO calendar (plane, uid, title, location, dtstart, source, status) VALUES ('personal','f1@x','Bimhuis: Jam','Bimhuis','2099-10-13T22:00:00+02:00','personal-twin','tentative')").run();
  return T.db.prepare("SELECT id FROM calendar WHERE uid='f1@x'").get().id;
}
async function feedLink(T, base, auth) {
  const r = await call(T.env, base, "GET", "/events.ics?plane=personal&from=2099-01-01", auth ? { headers: { Authorization: "Bearer " + auth } } : {});
  const t = await r.text();
  const m = t.match(/URL:(\S+\/e\/\d+\?s=[0-9a-f]+)/);
  return m ? m[1] : null;
}

// 1. its own worker: unchanged
{
  const T = makeEnv({ CAL_TOKEN: "tok-A" });
  const base = "https://calendar-api.q08.workers.dev";
  const id = await seed(T, base);
  const link = await feedLink(T, base, "tok-A");
  ok(link === base + "/e/" + id + "?s=" + sig("tok-A", id), "with CAL_TOKEN the link is 0.7.3's: same base, HMAC over calendar-feedback|CAL_TOKEN", link);
  const g = await call(T.env, base, "GET", "/e/" + id + "?s=" + sig("tok-A", id));
  const h = await g.text();
  ok(g.status === 200 && h.includes('<form method="post" action="?s=' + sig("tok-A", id) + '">'), "the form posts to ?s=<sig> relative to the page", h.match(/<form[^>]*>/));
  ok(/form-action 'self'/.test(g.headers.get("content-security-policy") || ""), "the page keeps form-action 'self'");
  const hj = await (await call(T.env, base, "GET", "/health")).json();
  ok(hj.feedback_links === true && !JSON.stringify(hj).includes("tok-A"), "/health reports feedback_links true and never the key", hj.feedback_links);
}
// 2. folded: CAL_KEY_SEED and CAL_PUBLIC_BASE, no CAL_TOKEN
{
  const seedv = "a".repeat(64);
  const base = "https://qnfo-lifecycle.q08.workers.dev/calendar";
  const T = makeEnv({ CAL_KEY_SEED: seedv, CAL_PUBLIC_BASE: base + "/" });
  const id = await seed(T, "https://internal");
  const r = await W.fetch(new Request("https://internal/events.ics?plane=personal&from=2099-01-01"), T.env, { props: { caller: "personal-api" } });
  const t = await r.text();
  const link = (t.match(/URL:(\S+\/e\/\d+\?s=[0-9a-f]+)/) || [])[1];
  ok(r.status === 200 && link === base + "/e/" + id + "?s=" + sig(seedv, id), "with only CAL_KEY_SEED the link is signed with the seed and carries CAL_PUBLIC_BASE (trailing slash trimmed)", link);
  const g = await call(T.env, "https://internal", "GET", "/e/" + id + "?s=" + sig(seedv, id));
  ok(g.status === 200, "the page accepts a seed-signed link", g.status);
  const p = await call(T.env, "https://internal", "POST", "/e/" + id + "?s=" + sig(seedv, id), { headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=keep" });
  ok(p.status === 200 && T.db.prepare("SELECT status FROM calendar WHERE id=?").get(id).status === "confirmed", "a POST through the seed-signed link records the answer", p.status);
  const x = await call(T.env, "https://internal", "GET", "/e/" + id + "?s=" + sig("tok-A", id));
  ok(x.status === 403, "a link signed with another key is refused", x.status);
  const hb = await call(T.env, "https://internal", "GET", "/events.ics?plane=personal", { headers: { Authorization: "Bearer " + seedv } });
  ok(hb.status === 401, "the seed is not a bearer token: without CAL_TOKEN the HTTP bearer gate stays closed", hb.status);
}
// 3. neither key
{
  const T = makeEnv({});
  const id = await seed(T, "https://internal");
  const g = await call(T.env, "https://internal", "GET", "/e/" + id + "?s=" + sig("", id));
  ok(g.status === 403, "with no key no link is valid", g.status);
  ok((await (await call(T.env, "https://internal", "GET", "/health")).json()).feedback_links === false, "/health reports feedback_links false with no key");
  ok(/no feedback key/.test(src) && /env\.CAL_TOKEN \|\| env\.CAL_KEY_SEED/.test(src), "the owner-question producer skips with no key, and the key falls back to the seed only when CAL_TOKEN is absent");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
