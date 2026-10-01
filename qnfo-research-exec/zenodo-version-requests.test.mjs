// Offline test (node:sqlite as D1 shim, fetch mocked) for ZENODO-VERSION-REQUESTS-1.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { applyCreatorPatch, drainMetadataEdits, drainVersionRequests } from "./worker.js";

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../migrations/2026-10-01-zenodo-version-requests.sql", import.meta.url), "utf8"));
db.exec(readFileSync(new URL("../migrations/2026-10-01-zenodo-version-requests-kind.sql", import.meta.url), "utf8"));
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


// ---- ZENODO-METADATA-EDITS-1 ----
const ORCID = "0009-0002-4317-5604";
const PATCH = { creator_by_orcid: { orcid: ORCID, name: "Quni-Gudzinas, Rowan Brad", affiliation: "QNFO (independent research)" } };

// 7. applyCreatorPatch: only the ORCID-matched creator changes; co-authors are untouched; malformed input is rejected.
const md = { creators: [{ name: "Rowan Brad Quni-Gudzinas", affiliation: "QNFO Research Collective", orcid: ORCID }, { name: "Doe, Jane", affiliation: "Uni" }] };
let ap = applyCreatorPatch(md, PATCH);
assert.equal(ap.changed, true); assert.equal(ap.creators[0].affiliation, "QNFO (independent research)"); assert.equal(ap.creators[0].name, "Quni-Gudzinas, Rowan Brad");
assert.deepEqual(ap.creators[1], { name: "Doe, Jane", affiliation: "Uni" }); assert.equal(md.creators[0].affiliation, "QNFO Research Collective");
assert.equal(applyCreatorPatch({ creators: ap.creators }, PATCH).changed, false);
assert.match(applyCreatorPatch(md, { creator_by_orcid: { orcid: "bad", name: "x" } }).error, /malformed/);
assert.match(applyCreatorPatch({ creators: [{ name: "Doe, Jane" }] }, PATCH).error, /no creator/);
assert.match(applyCreatorPatch(md, { creator_by_orcid: { orcid: ORCID } }).error, /name or affiliation/);

// Fake deposition API for records 501 (needs edit), 502 (already canonical), 503 (publish fails -> discard).
const deps = {
  501: { id: 501, metadata: { title: "A", creators: [{ name: "Rowan Brad Quni-Gudzinas", affiliation: "QWAV / QNFO", orcid: ORCID }] } },
  502: { id: 502, metadata: { title: "B", creators: [{ name: "Quni-Gudzinas, Rowan Brad", affiliation: "QNFO (independent research)", orcid: ORCID }] } },
  503: { id: 503, metadata: { title: "C", creators: [{ name: "Quni-Gudzinas, Rowan Brad", affiliation: "QNFO", orcid: ORCID }] } },
};
let putBodies = {};
globalThis.fetch = async (url, init = {}) => {
  const m = init.method || "GET";
  const u = String(url).replace(/[?&]access_token=t/, "");
  calls.push(m + " " + u);
  const mm = u.match(/\/deposit\/depositions\/(\d+)(\/actions\/(\w+))?$/);
  if (!mm) return ok({ message: "unexpected " + u }, 404);
  const id = Number(mm[1]), act = mm[3];
  if (m === "GET" && !act) return ok(deps[id]);
  if (m === "POST" && act === "edit") return ok(deps[id], 201);
  if (m === "PUT" && !act) { putBodies[id] = JSON.parse(init.body); return ok({ id, metadata: putBodies[id].metadata }); }
  if (m === "POST" && act === "publish") return id === 503 ? ok({ message: "boom" }, 400) : ok({ id, doi: "10.5281/zenodo." + id }, 202);
  if (m === "POST" && act === "discard") return ok({ id }, 201);
  return ok({ message: "unexpected " + m + " " + u }, 404);
};
const addMeta = (rid, patch) => Number(db.prepare("INSERT INTO zenodo_version_requests (record_id, files_json, metadata_json, kind) VALUES (?, '[]', ?, 'metadata')").run(rid, JSON.stringify(patch)).lastInsertRowid);
db.prepare("UPDATE zenodo_version_requests SET status='done-earlier' WHERE kind='version' AND status='pending'").run();
const m1 = addMeta(501, PATCH), m2 = addMeta(502, PATCH), m3 = addMeta(503, PATCH), m4 = addMeta(504, { creator_by_orcid: { orcid: "nope", name: "x" } });

// 8. Version drain ignores metadata rows.
assert.equal(await drainVersionRequests(env), null); assert.equal(get(m1).status, "pending");

// 9. One metadata drain handles all four: edit+put+publish / unchanged / discard on publish failure / malformed patch.
calls = [];
const res = await drainMetadataEdits(env, 8);
assert.equal(res.length, 4);
assert.equal(get(m1).status, "published"); assert.equal(get(m1).result_record_id, 501);
assert.equal(putBodies[501].metadata.creators[0].affiliation, "QNFO (independent research)");
assert.equal(putBodies[501].metadata.creators[0].name, "Quni-Gudzinas, Rowan Brad"); assert.equal(putBodies[501].metadata.title, "A");
assert.equal(get(m2).status, "unchanged"); assert.ok(!calls.includes("POST https://zenodo.org/api/deposit/depositions/502/actions/edit"));
assert.equal(get(m3).status, "error"); assert.match(get(m3).error, /publish failed/);
assert.ok(calls.includes("POST https://zenodo.org/api/deposit/depositions/503/actions/discard"));
assert.equal(get(m4).status, "error"); assert.match(get(m4).error, /malformed/);
assert.ok(!calls.some((c) => c.includes("/504/actions/")));

// 10. Errors are not retried; the limit is honoured.
assert.deepEqual(await drainMetadataEdits(env, 8), []);
for (let r = 600; r < 612; r++) addMeta(r, PATCH);
deps[600] = deps[501];
const lim = await drainMetadataEdits(env, 3);
assert.equal(lim.length, 3);
console.log("zenodo-version-requests: all assertions passed");
