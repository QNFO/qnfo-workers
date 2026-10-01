// OWNER-EDIT-1 + IDENTITY-STORE-1 offline suite: drives the real worker's fetch handler against in-memory SQLite D1 shims
// (the shared AUDIT and the private IDENTITY store) and proves: the one-time byte-checked move of owner_docs into the
// private store, that every read and edit then uses it and never the shared copy, the fallback without the binding, and
// the editor itself (auth, same-origin check, optimistic concurrency, version history, read-only archives). Synthetic data.
// Run: node qnfo-fleet-dashboard/owner-edit.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;

const db = new DatabaseSync(":memory:");      // shared qnfo-audit
const idb = new DatabaseSync(":memory:");     // private qnfo-identity (the worker creates its tables)
db.exec(`CREATE TABLE owner_docs (key TEXT PRIMARY KEY, title TEXT NOT NULL, body_md TEXT NOT NULL, source TEXT,
  visibility TEXT NOT NULL DEFAULT 'private', updated_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE portfolio_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_date TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'daily',
  session TEXT, summary TEXT, scorecard_json TEXT, actions_json TEXT, needs_owner TEXT, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE human_actions (id INTEGER PRIMARY KEY, title TEXT, due TEXT, status TEXT, updated_at TEXT);`);
db.prepare("INSERT INTO owner_docs (key, title, body_md, updated_at) VALUES ('identity', 'Identity', '# Identity\n\nOld line.\n', '2026-10-01 11:48:13')").run();
db.prepare("INSERT INTO owner_docs (key, title, body_md, updated_at) VALUES ('identity-archive-x', 'ARCHIVE', '# Archive\n', '2026-10-01 12:00:00')").run();
db.prepare("INSERT INTO portfolio_runs (run_date, kind, session, summary, needs_owner) VALUES ('2026-10-05', 'identity-weekly', 'qnfo-cloud-ops/t', 'Identity weekly 2026-10-05: ok', 'orcid: remove patent claim\nlead 4 due 2026-10-15')").run();

function stmtOn(dbx, sql) {
  let args = [];
  const self = {
    bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return self; },
    async all() { return { results: dbx.prepare(sql).all(...args) }; },
    async first() { return dbx.prepare(sql).get(...args) || null; },
    async run() { const r = dbx.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
const shim = (dbx) => ({ prepare: (sql) => stmtOn(dbx, sql), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } });
const AUDIT = shim(db);
const IDENTITY = shim(idb);
const OWNER_TOKEN = "t".repeat(32);
const LOOP_TOKEN = "loop-secret-123";
const env = { AUDIT, IDENTITY, OWNER_TOKEN, LOOP_TOKEN };
const cookie = "fleet_owner=" + createHash("sha256").update(OWNER_TOKEN).digest("hex");
const ORIGIN = "https://fleet.qnfo.org";
const ctx = { waitUntil() {}, passThroughOnException() {} };
const call = (path, init) => worker.fetch(new Request(ORIGIN + path, init), env, ctx);
const form = (o) => new URLSearchParams(o).toString();
const FORM = "application/x-www-form-urlencoded";
const doc = (k) => idb.prepare("SELECT * FROM owner_docs WHERE key = ?").get(k);      // the private store
const auditDoc = (k) => db.prepare("SELECT * FROM owner_docs WHERE key = ?").get(k);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// IDENTITY-STORE-1: nothing is in the private store until first use; the first owner request moves it, byte for byte.
ok(idb.prepare("SELECT name FROM sqlite_master WHERE name='owner_docs'").get() === undefined, "private store starts empty");
let r = await call("/owner", { headers: { Cookie: cookie } });
let h = await r.text();
ok(r.status === 200, "owner page opens with the cookie");
ok(doc("identity") && doc("identity").body_md === auditDoc("identity").body_md && doc("identity").updated_at === "2026-10-01 11:48:13", "identity copied byte for byte with its version");
ok(doc("identity-archive-x") && doc("identity-archive-x").visibility === "private", "archives copied too");
const meta = idb.prepare("SELECT value FROM store_meta WHERE key='migrated_from_audit'").get();
ok(meta && JSON.parse(meta.value).rows === 2, "the move is recorded once in store_meta");
ok(h.includes("Store: qnfo-identity"), "owner page names the private store");
ok(h.includes("Identity review (weekly)") && h.includes("orcid: remove patent claim"), "owner page shows the weekly identity items");
ok(h.includes('href="/owner/edit/identity"') && h.includes("identity-archive-x") && /archive-x.*read-only/s.test(h), "documents list: identity editable, archive read-only");
r = await call("/owner/edit/identity");
ok(r.status === 401, "editor is closed without a sign-in");
r = await call("/owner/edit/identity", { headers: { Cookie: cookie } });
h = await r.text();
ok(r.status === 200 && h.includes('name="if_updated_at" value="2026-10-01 11:48:13"') && h.includes("Old line.") && !h.includes('name="token"'), "editor opens with the cookie, carries the version, asks no token");
ok(!/<script/i.test(h), "editor page carries no script (CSP default-src 'none')");
r = await call("/owner/edit/identity-archive-x", { headers: { Cookie: cookie } });
ok(r.status === 403, "archives are read-only");
r = await call("/owner/edit/identity--v20261001114813", { headers: { Cookie: cookie } });
ok(r.status === 403, "earlier versions are read-only");

// Save with the cookie
const save = (body, extra, ver) => call("/owner/edit/identity", { method: "POST", headers: Object.assign({ Cookie: cookie, "Content-Type": FORM, Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" }, extra || {}), body: form(Object.assign({ if_updated_at: ver || doc("identity").updated_at, body_md: body })) });
r = await call("/owner/edit/identity", { method: "POST", headers: { Cookie: cookie, "Content-Type": FORM, "Sec-Fetch-Site": "cross-site" }, body: form({ if_updated_at: "2026-10-01 11:48:13", body_md: "# Hijack\n" }) });
ok(r.status === 403 && doc("identity").body_md.includes("Old line."), "a cross-site save is refused and writes nothing");
r = await save("# Identity\r\n\r\nNew line.\r\n");
h = await r.text();
ok(r.status === 200 && h.includes("Saved.") && h.includes("identity--v20261001114813"), "save succeeds and names the kept version");
ok(doc("identity").body_md === "# Identity\n\nNew line.\n", "CRLF from the browser is stored as LF");
ok(auditDoc("identity").body_md.includes("Old line.") && !auditDoc("identity--v20261001114813"), "edits land in the private store, never the shared copy");
const hist = doc("identity--v20261001114813");
ok(hist && hist.visibility === "history" && hist.body_md.includes("Old line."), "the replaced version is kept as a history row");
ok(doc("identity").updated_at !== "2026-10-01 11:48:13", "updated_at moves on save");
r = await save("# Identity\n\nNew line.\n");
ok(r.status === 200 && (await r.text()).includes("No changes to save."), "an unchanged save writes nothing");

// Optimistic concurrency: a stale version is never written
r = await save("# Stale\n", null, "2026-10-01 11:48:13");
h = await r.text();
ok(r.status === 409 && h.includes("Nothing was saved") && h.includes("# Stale"), "a stale save is refused and the owner keeps the text");
ok(doc("identity").body_md === "# Identity\n\nNew line.\n", "the newer version survives a stale save");
r = await save("   \n");
ok(r.status === 400 && doc("identity").body_md.includes("New line."), "an empty document is refused");

// LOOP_TOKEN in the form works without the cookie (until OWNER_TOKEN is set)
const env2 = { AUDIT, LOOP_TOKEN };   // no IDENTITY binding: falls back to the shared store (mid-deploy safety)
r = await worker.fetch(new Request(ORIGIN + "/owner/edit/identity", { method: "POST", headers: { "Content-Type": FORM }, body: form({ token: LOOP_TOKEN }) }), env2, ctx);
h = await r.text();
ok(r.status === 200 && h.includes('name="token"'), "LOOP_TOKEN opens the editor, which asks for the token again on save");
r = await worker.fetch(new Request(ORIGIN + "/owner/edit/identity", { method: "POST", headers: { "Content-Type": FORM }, body: form({ token: LOOP_TOKEN, if_updated_at: auditDoc("identity").updated_at, body_md: "# Identity\n\nBy token.\n" }) }), env2, ctx);
ok(r.status === 200 && auditDoc("identity").body_md.includes("By token.") && !doc("identity").body_md.includes("By token."), "without the binding a LOOP_TOKEN save uses the shared store");
r = await worker.fetch(new Request(ORIGIN + "/owner/edit/identity", { method: "POST", headers: { "Content-Type": FORM }, body: form({ token: "wrong", if_updated_at: auditDoc("identity").updated_at, body_md: "# Bad\n" }) }), env2, ctx);
ok(r.status === 401 && auditDoc("identity").body_md.includes("By token."), "a wrong token writes nothing");
r = await worker.fetch(new Request(ORIGIN + "/owner/edit/identity", { method: "POST", headers: { "Content-Type": FORM }, body: form({ token: LOOP_TOKEN, if_updated_at: doc("identity").updated_at, body_md: "# Identity\n\nPrivate by token.\n" }) }), { AUDIT, IDENTITY, LOOP_TOKEN }, ctx);
ok(r.status === 200 && doc("identity").body_md.includes("Private by token."), "with the binding a LOOP_TOKEN save uses the private store");

// Doc view links and history count
r = await call("/owner/doc/identity", { headers: { Cookie: cookie } });
ok((await r.text()).includes('href="/owner/edit/identity"'), "doc view links to the editor");
r = await call("/owner", { headers: { Cookie: cookie } });
ok(/2 earlier version\(s\) kept/.test(await r.text()), "owner page counts kept versions (private store)");
ok(idb.prepare("SELECT COUNT(*) n FROM store_meta").get().n === 1, "the move ran once, not on every request");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
