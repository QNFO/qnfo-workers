// Offline test (node:sqlite as D1 shim, fetch mocked) for ZENODO-VERSION-REQUESTS-1.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { drainVersionRequests } from "./worker.js";

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../migrations/2026-10-01-zenodo-version-requests.sql", import.meta.url), "utf8"));
function stmt(sql) {
  let args = [];
  const o = { bind(...a) { args = a; return o; },
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; } };
  return o;
}
const env = { QNFO_AUDIT: { prepare: stmt }, ZENODO_TOKEN: "t" };
const get = (id) => db.prepare("SELECT * FROM zenodo_version_requests WHERE id=?").get(id);
const SHA = "d1a403c0000000000000000000000000000000aa";
const raw = (p) => `https://raw.githubusercontent.com/rwnq8/resume/${SHA}/${p}`;

// Fake Zenodo + GitHub raw.
let calls = [];
let failPublish = false;
const ok = (body, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
globalThis.fetch = async (url, init = {}) => {
  const m = init.method || "GET";
  const u = String(url).replace(/[?&]access_token=t/, "");
  calls.push(m + " " + u);
  if (u.startsWith("https://raw.githubusercontent.com/")) return ok("content of " + u.split("/").pop());
  if (m === "POST" && u.endsWith("/21806274/actions/newversion")) return ok({ links: { latest_draft: "https://zenodo.org/api/deposit/depositions/999" } }, 201);
  if (m === "GET" && u.endsWith("/depositions/999")) return ok({ id: 999, links: { bucket: "https://zenodo.org/api/files/b1" }, metadata: { title: "Old", doi: "10.5281/zenodo.21806274", creators: [{ name: "X" }], version: "v3.12" } });
  if (m === "GET" && u.endsWith("/depositions/999/files")) return ok([{ filename: "old.pdf", links: { self: "https://zenodo.org/api/deposit/depositions/999/files/f1" } }]);
  if (m === "DELETE" && u.endsWith("/files/f1")) return new Response(null, { status: 204 });
  if (m === "PUT" && u.startsWith("https://zenodo.org/api/files/b1/")) return ok({ key: u.split("/").pop() }, 201);
  if (m === "PUT" && u.endsWith("/depositions/999")) return ok({ id: 999, metadata: JSON.parse(init.body).metadata });
  if (m === "POST" && u.endsWith("/999/actions/publish")) return failPublish ? ok({ message: "boom" }, 400) : ok({ id: 1000, doi: "10.5281/zenodo.1000" }, 202);
  return ok({ message: "unexpected " + m + " " + u }, 404);
};
const add = (files, meta) => Number(db.prepare("INSERT INTO zenodo_version_requests (record_id, files_json, metadata_json) VALUES (21806274, ?, ?)").run(JSON.stringify(files), JSON.stringify(meta || {})).lastInsertRowid);

// 1. No pending rows: nothing happens.
assert.equal(await drainVersionRequests(env), null);

// 2. A disallowed URL (moving branch) is rejected before any Zenodo call.
const bad = add([{ name: "RESUME.md", url: "https://raw.githubusercontent.com/rwnq8/resume/main/RESUME.md" }]);
calls = [];
let r = await drainVersionRequests(env);
assert.equal(r.status, "error"); assert.match(get(bad).error, /pinned/); assert.equal(calls.length, 0);

// 3. Another host is rejected too.
const host = add([{ name: "a.md", url: `https://example.com/rwnq8/resume/${SHA}/a.md` }]);
r = await drainVersionRequests(env);
assert.equal(get(host).status, "error"); assert.equal(calls.length, 0);

// 4. Happy path: new version, carried file deleted, files uploaded, metadata merged without the old DOI, published.
const good = add([{ name: "RESUME.md", url: raw("RESUME.md") }, { name: "rowan-quni-cv-v4.0.pdf", url: raw("rowan-quni-cv-v4.0.pdf") }], { title: "New", version: "v4.0", publication_date: "2026-10-01" });
calls = [];
r = await drainVersionRequests(env);
assert.equal(r.status, "published"); assert.equal(get(good).result_doi, "10.5281/zenodo.1000"); assert.equal(get(good).result_record_id, 1000);
assert.ok(calls.includes("DELETE https://zenodo.org/api/deposit/depositions/999/files/f1"));
assert.ok(calls.includes("PUT https://zenodo.org/api/files/b1/RESUME.md"));
assert.ok(calls.includes("PUT https://zenodo.org/api/files/b1/rowan-quni-cv-v4.0.pdf"));
assert.ok(calls.indexOf("DELETE https://zenodo.org/api/deposit/depositions/999/files/f1") < calls.indexOf("PUT https://zenodo.org/api/files/b1/RESUME.md"));

// 5. A publish failure is recorded with the draft id, and the row is not retried.
failPublish = true;
const fail = add([{ name: "RESUME.md", url: raw("RESUME.md") }], {});
r = await drainVersionRequests(env);
assert.equal(get(fail).status, "error"); assert.equal(get(fail).draft_id, "999"); assert.match(get(fail).error, /publish failed/);
assert.equal(await drainVersionRequests(env), null);

// 6. Without a token the drain does nothing (and claims nothing).
const idle = add([{ name: "RESUME.md", url: raw("RESUME.md") }], {});
assert.equal(await drainVersionRequests({ QNFO_AUDIT: env.QNFO_AUDIT }), null);
assert.equal(get(idle).status, "pending");

console.log("zenodo-version-requests: all assertions passed");
