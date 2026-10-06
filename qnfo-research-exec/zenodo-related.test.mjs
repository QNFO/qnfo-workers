// ZENODO-READ-ONLINE-1 (#1907) offline suite: kind='related' rows add one isVariantFormOf related identifier
// (https://papers.qnfo.org/papers/<slug>/) to the LATEST version of a published Zenodo record, idempotently, through the
// same claim / GET / edit / PUT / publish / discard pattern as the metadata drain; the closing probe re-reads the public
// API and closes the issue only when every sampled record lists the link. node:sqlite is the D1 shim, fetch is mocked.
// Run: node --no-warnings qnfo-research-exec/zenodo-related.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { applyRelatedLink, drainRelatedLinks, legacyUploadFields, seedRelatedLinks, verifyRelatedBackfill } from "./worker.js";

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
const LINK = "https://papers.qnfo.org/papers/some-paper/";

// 1 applyRelatedLink: add when absent, keep when present in any spelling, refuse a bad slug.
let a = applyRelatedLink({ title: "T" }, { related_link: { slug: "some-paper" } });
assert.equal(a.changed, true);
assert.deepEqual(a.related_identifiers, [{ identifier: LINK, relation: "isVariantFormOf", resource_type: "publication-preprint" }]);
a = applyRelatedLink({ related_identifiers: [{ identifier: "arXiv:2501.00001", relation: "isSupplementTo" }] }, { related_link: { slug: "some-paper" } });
assert.equal(a.changed, true);
assert.equal(a.related_identifiers.length, 2, "existing identifiers are kept");
a = applyRelatedLink({ related_identifiers: [{ identifier: "https://papers.qnfo.org/papers/Some-Paper", relation: "isVariantFormOf", scheme: "url" }] }, { related_link: { slug: "some-paper" } });
assert.equal(a.changed, false, "trailing slash and case do not count as a change");
a = applyRelatedLink({ related_identifiers: [{ identifier: LINK, relation: "isSupplementTo" }] }, { related_link: { slug: "some-paper" } });
assert.equal(a.changed, true, "the same URL under another relation is not the link");
assert.match(applyRelatedLink({}, { related_link: { slug: "../evil" } }).error, /slug/);
assert.match(applyRelatedLink({}, {}).error, /slug/);

// 1b RELATED-LEGACY-FIELDS-1: an InvenioRDM resource_type without the legacy fields gets upload_type / publication_type.
let lf = legacyUploadFields({ title: "T", resource_type: { title: "Preprint", type: "publication", subtype: "preprint" } });
assert.equal(lf.upload_type, "publication");
assert.equal(lf.publication_type, "preprint");
assert.equal(lf.title, "T", "other fields are kept");
assert.deepEqual(lf.resource_type, { title: "Preprint", type: "publication", subtype: "preprint" }, "resource_type stays (the API ignores it on the legacy PUT)");
lf = legacyUploadFields({ upload_type: "publication", publication_type: "article", resource_type: { type: "publication", subtype: "preprint" } });
assert.equal(lf.publication_type, "article", "existing legacy fields win");
assert.deepEqual(legacyUploadFields({ title: "plain" }), { title: "plain" }, "no resource_type: unchanged");
assert.equal(legacyUploadFields({ resource_type: { type: "image", subtype: "figure" } }).image_type, "figure");
assert.equal(legacyUploadFields({ resource_type: { type: "dataset" } }).upload_type, "dataset");
assert.deepEqual(legacyUploadFields(null), {}, "null metadata is tolerated");

// 2 the drain against a fake Zenodo: three rows.
//   row 1: record 100 is its own latest, has no link -> edit, PUT with the link appended, publish -> published.
//   row 2: record 200's latest version is 201, which already lists the link -> unchanged on 201, no edit call.
//   row 3: record 300, publish fails -> error, the draft is discarded.
db.exec("INSERT INTO zenodo_version_requests (record_id, files_json, metadata_json, kind, requested_by) VALUES (100, '[]', '{\"related_link\":{\"slug\":\"some-paper\"}}', 'related', 'test'), (200, '[]', '{\"related_link\":{\"slug\":\"other-paper\"}}', 'related', 'test'), (300, '[]', '{\"related_link\":{\"slug\":\"third-paper\"}}', 'related', 'test')");
let calls = [];
const ok = (body, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
// record 100 is the 22025544 case: InvenioRDM resource_type, no legacy upload_type; the PUT must carry the legacy fields.
const meta100 = { title: "A", creators: [{ name: "X" }], resource_type: { title: "Preprint", type: "publication", subtype: "preprint" }, related_identifiers: [{ identifier: "arXiv:2501.00001", relation: "isSupplementTo", scheme: "arxiv" }] };
const meta201 = { title: "B", related_identifiers: [{ identifier: "https://papers.qnfo.org/papers/other-paper/", relation: "isVariantFormOf", resource_type: "publication-preprint", scheme: "url" }] };
const meta300 = { title: "C" };
let putBody = null;
const fake = async (url, init = {}) => {
  const m = init.method || "GET";
  const u = String(url).replace(/[?&]access_token=t/, "");
  calls.push(m + " " + u);
  if (u === "https://zenodo.org/api/records/100/versions/latest") return ok({ id: 100 });
  if (u === "https://zenodo.org/api/records/200/versions/latest") return ok({ id: 201 });
  if (u === "https://zenodo.org/api/records/300/versions/latest") return ok({ message: "nope" }, 500);
  if (m === "GET" && u.endsWith("/depositions/100")) return ok({ id: 100, metadata: meta100 });
  if (m === "GET" && u.endsWith("/depositions/201")) return ok({ id: 201, metadata: meta201 });
  if (m === "GET" && u.endsWith("/depositions/300")) return ok({ id: 300, metadata: meta300 });
  if (m === "POST" && u.endsWith("/depositions/100/actions/edit")) return ok({ id: 100, metadata: meta100 }, 201);
  if (m === "POST" && u.endsWith("/depositions/300/actions/edit")) return ok({ id: 300, metadata: meta300 }, 201);
  if (m === "PUT" && u.endsWith("/depositions/100")) { putBody = JSON.parse(init.body); return ok({ id: 100, metadata: putBody.metadata }); }
  if (m === "PUT" && u.endsWith("/depositions/300")) return ok({ id: 300, metadata: JSON.parse(init.body).metadata });
  if (m === "POST" && u.endsWith("/depositions/100/actions/publish")) return ok({ id: 100, doi: "10.5281/zenodo.100" }, 202);
  if (m === "POST" && u.endsWith("/depositions/300/actions/publish")) return ok({ message: "boom" }, 400);
  if (m === "POST" && u.endsWith("/depositions/300/actions/discard")) return ok({}, 201);
  return ok({ message: "unexpected " + m + " " + u }, 404);
};
globalThis.fetch = fake;
const out = await drainRelatedLinks(env, 10, fake);
assert.equal(out.length, 3);
assert.deepEqual(out.map((o) => o.status), ["published", "unchanged", "error"]);
assert.equal(get(1).status, "published");
assert.equal(get(1).result_record_id, 100);
assert.equal(putBody.metadata.related_identifiers.length, 2, "PUT keeps the existing identifier and appends the link");
assert.deepEqual(putBody.metadata.related_identifiers[1], { identifier: LINK, relation: "isVariantFormOf", resource_type: "publication-preprint" });
assert.equal(putBody.metadata.title, "A", "the rest of the metadata is sent back unchanged");
assert.equal(putBody.metadata.upload_type, "publication", "the legacy upload_type is filled from resource_type before the PUT");
assert.equal(putBody.metadata.publication_type, "preprint", "the legacy publication_type is filled from resource_type.subtype");
assert.equal(get(2).status, "unchanged");
assert.equal(get(2).result_record_id, 201, "the edit targets the latest version of the concept");
assert.ok(!calls.some((c) => c.includes("/depositions/201/actions/edit")), "no edit on a record that already lists the link");
assert.ok(!calls.some((c) => c.includes("/depositions/200")), "the superseded version is never read through the deposit API");
assert.equal(get(3).status, "error");
assert.match(get(3).error, /publish failed/);
assert.equal(get(3).result_record_id, null);
assert.ok(calls.some((c) => c === "POST https://zenodo.org/api/deposit/depositions/300/actions/discard"), "a failed publish discards the draft");
assert.equal((await drainRelatedLinks(env, 10, fake)).length, 0, "nothing pending is left; the drain is idempotent");

// 3 the closing probe: waits while rows are busy, stays open on an error row, closes on a clean public re-read.
db.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, updated_at INTEGER)");
db.exec("CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT)");
db.exec("INSERT INTO agent_issues (id, title, status) VALUES (1907, 'ZENODO-READ-ONLINE-1: link each Zenodo record to its papers.qnfo.org page', 'open')");
db.exec("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (1907, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-05 08:04:29')");
db.exec("CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix') AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') BEGIN SELECT RAISE(ABORT,'close-without-evidence'); END");
const pub = async (url) => {
  const u = String(url);
  if (u.endsWith("/records/100")) return ok({ id: 100, metadata: { related_identifiers: [{ identifier: LINK, relation: "isVariantFormOf", scheme: "url" }] } });
  if (u.endsWith("/records/201")) return ok({ id: 201, metadata: meta201 });
  return ok({ message: "not found" }, 404);
};
let v = await verifyRelatedBackfill(env, pub);
assert.equal(v.closed, false, "an error row keeps the issue open");
assert.match(v.summary, /error=1/);
assert.equal(db.prepare("SELECT status FROM agent_issues WHERE id=1907").get().status, "open");
db.exec("UPDATE zenodo_version_requests SET status='pending' WHERE id=3");
v = await verifyRelatedBackfill(env, pub);
assert.equal(v.waiting, 1, "a pending row means wait");
db.exec("UPDATE zenodo_version_requests SET status='skipped', error='record not owned' WHERE id=3");
v = await verifyRelatedBackfill(env, pub);
assert.equal(v.closed, true, "published and unchanged rows re-read clean on the public API");
assert.match(v.summary, /public re-read 2\/2 list the papers\.qnfo\.org page as isVariantFormOf/);
assert.equal(db.prepare("SELECT status FROM agent_issues WHERE id=1907").get().status, "closed");
assert.match(db.prepare("SELECT close_evidence FROM issue_triage WHERE issue_id=1907").get().close_evidence, /^ZENODO-READ-ONLINE-1 verify /);
assert.equal(await verifyRelatedBackfill(env, pub), null, "nothing to do once the issue is closed");

// 4 seeding from LIVING_PAPER.papers: one pending row per published page whose record maps to exactly one page, once.
const lp = new DatabaseSync(":memory:");
lp.exec("CREATE TABLE papers (slug TEXT, status TEXT, doi TEXT, zenodo_doi TEXT)");
lp.exec("INSERT INTO papers (slug, status, doi, zenodo_doi) VALUES ('a-paper', 'published', '10.5281/zenodo.500', NULL), ('b-paper', 'published', '10.5281/zenodo.1', '10.5281/zenodo.501'), ('shared-one', 'published', '10.5281/zenodo.502', NULL), ('shared-two', 'published', '10.5281/zenodo.502', NULL), ('adelic-constraints-on-quantum-field-theory-phase-1', 'published', '10.5281/zenodo.503', NULL), ('quarantined-paper', 'quarantined', '10.5281/zenodo.504', NULL), ('no-doi-paper', 'published', 'arXiv:2501.00001', NULL), ('Bad Slug', 'published', '10.5281/zenodo.505', NULL), ('some-paper', 'published', '10.5281/zenodo.100', NULL)");
function lpStmt(sql) {
  let args = [];
  const o = { bind(...a) { args = a; return o; }, async run() { lp.prepare(sql).run(...args); return { meta: { changes: 1 } }; }, async first() { return lp.prepare(sql).get(...args) || null; }, async all() { return { results: lp.prepare(sql).all(...args) }; } };
  return o;
}
const env2 = { QNFO_AUDIT: { prepare: stmt }, LIVING_PAPER: { prepare: lpStmt }, ZENODO_TOKEN: "t" };
let sd = await seedRelatedLinks(env2);
assert.deepEqual(sd, { candidates: 3, shared: 1, existing: 1, seeded: 2 }, "500 and 501 seeded; 100 already queued; 502 shared by two pages; 503 on the skip list; quarantined, no-DOI and bad-slug rows ignored");
const seeded = db.prepare("SELECT record_id, metadata_json, status, requested_by FROM zenodo_version_requests WHERE kind='related' AND record_id IN (500, 501) ORDER BY record_id").all();
assert.equal(seeded.length, 2);
assert.equal(seeded[0].status, "pending");
assert.equal(JSON.parse(seeded[0].metadata_json).related_link.slug, "a-paper");
assert.equal(JSON.parse(seeded[1].metadata_json).related_link.slug, "b-paper", "zenodo_doi wins over doi when both are set");
assert.equal(seeded[0].requested_by, "qnfo-research-exec/seedRelatedLinks");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM zenodo_version_requests WHERE kind='related' AND record_id IN (502, 503, 504, 505)").get().n, 0);
sd = await seedRelatedLinks(env2);
assert.deepEqual([sd.seeded, sd.existing], [0, 3], "a second run seeds nothing");
assert.deepEqual(await seedRelatedLinks({ QNFO_AUDIT: { prepare: stmt } }), { seeded: 0, skipped: "no binding" });

console.log("zenodo-related: 42 checks passed");
