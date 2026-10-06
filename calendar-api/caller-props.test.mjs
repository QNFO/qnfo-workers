// calendar-api caller-props suite (0.7.1, CAL-CALLER-PROPS-1, charter pillar: personal).
// radar-hub has no CAL_TOKEN secret, so its CAL_API calls were refused and the personal radar posted nothing after
// 2026-09-23. Internal workers now authenticate by service-binding props (ctx.props.caller), as qnfo-ai does (#1703).
// Proves: a binding caller with props can list and add personal events without a bearer; a request without props and
// without the token is still refused; a wrong bearer is still refused; a malformed caller name does not authenticate;
// the CAL_TOKEN bearer keeps working. Synthetic rows only.
// Run: node calendar-api/caller-props.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const W = mod.default;

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra) : "")); } };

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
const env = {
  CAL_DB: { prepare: (sql) => stmtOn(sql), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } },
  ICS_R2: { async put() {}, async delete() {} },
  CAL_TOKEN: "test-token-123"
};
const call = (method, path, opts, ctx) => W.fetch(new Request("https://calendar-api" + path, Object.assign({ method }, opts || {})), env, ctx);
const radar = { props: { caller: "radar-hub" } };
const body = (o) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(o) });
const ev = { title: "Rijksmuseum: Willem de Kooning at work", dtstart: "2099-10-20", location: "Rijksmuseum", source: "personal-radar", status: "tentative", relevance: 6, friction: 2 };

await call("GET", "/health");
{
  const r = await call("GET", "/events?plane=personal", {}, radar);
  ok(r.status === 200, "a radar-hub binding with props lists personal events without a bearer", r.status);
  const p = await call("POST", "/events?plane=personal", body(ev), radar);
  const j = await p.json();
  ok(p.status === 201 && j.ok && j.id, "a radar-hub binding with props adds a personal event", { status: p.status, j });
  const row = db.prepare("SELECT source, status FROM calendar WHERE id = ?").get(j.id);
  ok(row && row.source === "personal-radar" && row.status === "tentative", "the row keeps source and status", row);
}
{
  const r = await call("GET", "/events?plane=personal", {}, {});
  ok(r.status === 401, "no props and no bearer is refused (the state radar-hub was in)", r.status);
  const p = await call("POST", "/events?plane=personal", body(ev), undefined);
  ok(p.status === 401, "a public POST without a context is refused", p.status);
  const w = await call("GET", "/events?plane=personal", { headers: { Authorization: "Bearer wrong" } }, {});
  ok(w.status === 401, "a wrong bearer is refused", w.status);
  const bad = await call("GET", "/events?plane=personal", {}, { props: { caller: "Radar Hub!" } });
  const empty = await call("GET", "/events?plane=personal", {}, { props: { caller: "" } });
  const nonStr = await call("GET", "/events?plane=personal", {}, { props: { caller: 42 } });
  ok(bad.status === 401 && empty.status === 401 && nonStr.status === 401, "a malformed, empty or non-string caller does not authenticate", [bad.status, empty.status, nonStr.status]);
  const t = await call("GET", "/events?plane=personal", { headers: { Authorization: "Bearer test-token-123" } });
  ok(t.status === 200, "the CAL_TOKEN bearer still works", t.status);
}
{
  const h = await (await call("GET", "/health", {}, radar)).json();
  const hp = await (await call("GET", "/health")).json();
  ok(/^0\.7\.\d/.test(String(h.version)) && Array.isArray(h.ics_publish.urls) && Array.isArray(hp.ics_publish.urls) && hp.ics_publish.urls.length === 0,"health reports 0.7.x and still hides feed URLs from a public caller", { v: h.version, pub: hp.ics_publish.urls });
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
