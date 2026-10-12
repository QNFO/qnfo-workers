// SCHOLAR-PDF-ALL-1 (1.2.0, agent_issues 2410): the backlog renderer is read out of worker.js between its begin/end markers, so the
// suite needs no bundle dependencies. A fake env stands in for D1 (LIVING, AUDIT), R2 (RELEASES) and Browser Rendering (deps.renderPdf).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "worker.js"), "utf8");
const block = src.slice(src.indexOf("// SCHOLAR-PDF-ALL-1 begin"), src.indexOf("// SCHOLAR-PDF-ALL-1 end"));
assert.ok(block.length > 500, "the SCHOLAR-PDF-ALL-1 block is present");
const { renderPdfBacklog, pdfNeedsRefresh, pdfBacklogBatch } = new Function(block + "\nreturn { renderPdfBacklog, pdfNeedsRefresh, pdfBacklogBatch };")();

function fakeD1(handler) {
  // handler(sql, params) -> rows (array) ; .first() returns rows[0]; .run() records the write
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return {
        bind(...params) { return this._p(sql, params); },
        _p(s, params) {
          return {
            all: async () => ({ results: handler(s, params, writes) || [] }),
            first: async () => ((handler(s, params, writes) || [])[0] || null),
            run: async () => { writes.push({ sql: s, params }); return { success: true }; },
          };
        },
        all: async () => ({ results: handler(sql, [], writes) || [] }),
        first: async () => ((handler(sql, [], writes) || [])[0] || null),
        run: async () => { writes.push({ sql, params: [] }); return { success: true }; },
      };
    },
  };
}

function papersDb(papers) {
  return fakeD1((sql, params) => {
    if (/SELECT COUNT\(\*\) AS n FROM papers/.test(sql)) return [{ n: papers.filter((p) => !p.pdf_path && (p.body_md || "").length > 200).length }];
    if (/pdf_path IS NULL OR pdf_path = ''\) ORDER BY created_at DESC LIMIT/.test(sql)) return papers.filter((p) => !p.pdf_path && (p.body_md || "").length > 200).slice(0, params[0]);
    if (/pdf_path IS NOT NULL AND pdf_path <> '' AND updated_at >/.test(sql)) return papers.filter((p) => p.pdf_path && p.recent);
    return [];
  });
}

const BIG = "x".repeat(300);

test("batch size comes from PDF_BACKLOG_BATCH within 1..20, else 6", () => {
  assert.equal(pdfBacklogBatch({ PDF_BACKLOG_BATCH: "4" }), 4);
  assert.equal(pdfBacklogBatch({ PDF_BACKLOG_BATCH: "0" }), 6);
  assert.equal(pdfBacklogBatch({ PDF_BACKLOG_BATCH: "99" }), 6);
  assert.equal(pdfBacklogBatch({}), 6);
});

test("a paper changed after its stored PDF needs a refresh; an older change or a missing object is decided accordingly", () => {
  assert.equal(pdfNeedsRefresh("2026-10-12 11:34:06", new Date("2026-10-12T10:00:00Z")), true);
  assert.equal(pdfNeedsRefresh("2026-10-12 09:00:00", new Date("2026-10-12T10:00:00Z")), false);
  assert.equal(pdfNeedsRefresh("2026-10-12 09:00:00", null), true);
  assert.equal(pdfNeedsRefresh("garbage", new Date()), false);
});

test("renders the newest papers without a PDF, writes pdf_path, the metric and the run event", async () => {
  const papers = [
    { slug: "new-a", title: "A", body_md: BIG, created_at: "2026-10-12 11:00:00", updated_at: "2026-10-12 11:00:00", pdf_path: null },
    { slug: "new-b", title: "B", body_md: BIG, created_at: "2026-10-12 10:00:00", updated_at: "2026-10-12 10:00:00", pdf_path: null },
    { slug: "thin", title: "T", body_md: "short", created_at: "2026-10-12 09:00:00", updated_at: "2026-10-12 09:00:00", pdf_path: null },
    { slug: "done", title: "D", body_md: BIG, created_at: "2026-10-11 09:00:00", updated_at: "2026-10-11 09:00:00", pdf_path: "pdf/done.pdf" },
  ];
  const living = papersDb(papers);
  const audit = fakeD1((sql) => (/pdf-render-fail/.test(sql) ? [] : []));
  const puts = [];
  const env = { LIVING: living, AUDIT: audit, BROWSER: {}, RELEASES: { put: async (k, b) => puts.push(k), head: async () => null }, PDF_BACKLOG_BATCH: "6" };
  const deps = { renderFullHTML: (md, o) => "<html>" + o.title + md.length + "</html>", renderPdf: async (e, html) => new Uint8Array(1024).buffer, stash: async (e, slug, bytes) => { await e.RELEASES.put("pdf/" + slug + ".pdf", bytes); return "pdf/" + slug + ".pdf"; } };
  const out = await renderPdfBacklog(env, deps, {});
  assert.equal(out.ok, true);
  assert.equal(out.rendered, 2, JSON.stringify(out));
  assert.deepEqual(out.slugs, ["new-a", "new-b"]);
  assert.equal(out.backlog_before, 2);
  assert.equal(out.backlog_after, 0);
  assert.deepEqual(puts, ["pdf/new-a.pdf", "pdf/new-b.pdf"]);
  const pathWrites = living.writes.filter((w) => /UPDATE papers SET pdf_path/.test(w.sql)).map((w) => w.params);
  assert.deepEqual(pathWrites, [["pdf/new-a.pdf", "new-a"], ["pdf/new-b.pdf", "new-b"]]);
  const metric = audit.writes.find((w) => /scholar_pdf_backlog/.test(w.sql));
  assert.ok(metric && metric.params[0] === "0", "metric written with the remaining backlog");
  const run = audit.writes.find((w) => /INSERT INTO cloud_ops_events/.test(w.sql) && w.params[1] === "pdf-backlog");
  assert.ok(run && run.params[4] === "ok", "run event recorded ok");
});

test("a render failure is counted, recorded as pdf-render-fail and does not stop the batch; the backlog stays", async () => {
  const papers = [
    { slug: "bad", title: "Bad", body_md: BIG, created_at: "2026-10-12 11:00:00", updated_at: "2026-10-12 11:00:00", pdf_path: null },
    { slug: "good", title: "Good", body_md: BIG, created_at: "2026-10-12 10:00:00", updated_at: "2026-10-12 10:00:00", pdf_path: null },
  ];
  const living = papersDb(papers);
  const audit = fakeD1(() => []);
  const env = { LIVING: living, AUDIT: audit, BROWSER: {}, RELEASES: { put: async () => {}, head: async () => null } };
  const deps = { renderFullHTML: () => "<html/>", renderPdf: async (e, html, t) => { if (t === "Bad") throw new Error("Browser Run error (502): busy"); return new Uint8Array(10).buffer; }, stash: async (e, slug) => "pdf/" + slug + ".pdf" };
  const out = await renderPdfBacklog(env, deps, {});
  assert.equal(out.rendered, 1);
  assert.equal(out.failed, 1);
  assert.equal(out.backlog_after, 1);
  assert.ok(out.errors[0].startsWith("bad: Browser Run error"));
  const fail = audit.writes.find((w) => /INSERT INTO cloud_ops_events/.test(w.sql) && w.params[1] === "pdf-render-fail");
  assert.ok(fail && JSON.parse(fail.params[3]).slug === "bad", "the failure names the slug");
  assert.ok(living.writes.every((w) => !/pdf_path = \?1 WHERE slug = \?2/.test(w.sql) || w.params[1] !== "bad"), "no pdf_path written for the failed paper");
});

test("a paper that failed three times today is skipped and the next one taken", async () => {
  const papers = [
    { slug: "poison", title: "P", body_md: BIG, created_at: "2026-10-12 11:00:00", updated_at: "2026-10-12 11:00:00", pdf_path: null },
    { slug: "fine", title: "F", body_md: BIG, created_at: "2026-10-12 10:00:00", updated_at: "2026-10-12 10:00:00", pdf_path: null },
  ];
  const living = papersDb(papers);
  const audit = fakeD1((sql) => (/pdf-render-fail/.test(sql) && /GROUP BY slug/.test(sql) ? [{ slug: "poison", n: 3 }] : []));
  const env = { LIVING: living, AUDIT: audit, BROWSER: {}, RELEASES: { put: async () => {}, head: async () => null } };
  const deps = { renderFullHTML: () => "<html/>", renderPdf: async () => new Uint8Array(10).buffer, stash: async (e, slug) => "pdf/" + slug + ".pdf" };
  const out = await renderPdfBacklog(env, deps, { batch: 1 });
  assert.deepEqual(out.slugs, ["fine"]);
});

test("a stored PDF older than the paper's last change is re-rendered when the batch has room; one up to date is left alone", async () => {
  const papers = [
    { slug: "stale", title: "S", body_md: BIG, created_at: "2026-10-01 00:00:00", updated_at: "2026-10-12 11:00:00", pdf_path: "pdf/stale.pdf", recent: true },
    { slug: "fresh", title: "R", body_md: BIG, created_at: "2026-10-01 00:00:00", updated_at: "2026-10-12 08:00:00", pdf_path: "pdf/fresh.pdf", recent: true },
  ];
  const living = papersDb(papers);
  const env = { LIVING: living, AUDIT: null, BROWSER: {}, RELEASES: { put: async () => {}, head: async (k) => ({ uploaded: new Date(k === "pdf/stale.pdf" ? "2026-10-12T10:00:00Z" : "2026-10-12T09:00:00Z") }) } };
  const deps = { renderFullHTML: () => "<html/>", renderPdf: async () => new Uint8Array(10).buffer, stash: async (e, slug) => "pdf/" + slug + ".pdf" };
  const out = await renderPdfBacklog(env, deps, {});
  assert.deepEqual(out.slugs, ["stale"]);
  assert.equal(out.refreshed, 1);
  assert.equal(out.backlog_before, 0);
  assert.equal(out.backlog_after, 0);
});

test("an oversize PDF is stored and flagged, since the gateway withholds citation_pdf_url above 5 MB", async () => {
  const papers = [{ slug: "huge", title: "H", body_md: BIG, created_at: "2026-10-12 11:00:00", updated_at: "2026-10-12 11:00:00", pdf_path: null }];
  const audit = fakeD1(() => []);
  const env = { LIVING: papersDb(papers), AUDIT: audit, BROWSER: {}, RELEASES: { put: async () => {}, head: async () => null } };
  const deps = { renderFullHTML: () => "<html/>", renderPdf: async () => ({ byteLength: 6 * 1024 * 1024 }), stash: async (e, slug) => "pdf/" + slug + ".pdf" };
  const out = await renderPdfBacklog(env, deps, {});
  assert.equal(out.rendered, 1);
  assert.equal(out.oversize, 1);
  assert.ok(audit.writes.some((w) => w.params && w.params[1] === "pdf-oversize"));
});

test("missing bindings fail closed without throwing", async () => {
  const out = await renderPdfBacklog({}, {}, {});
  assert.equal(out.ok, false);
});

test("the worker declares the scheduled handler, the cron and the version", () => {
  assert.ok(/async scheduled\(controller, env, ctx\)/.test(src));
  assert.ok(/var VERSION = "1\.2\.\d+/.test(src) || /var VERSION = "1\.[3-9]/.test(src), "VERSION at least 1.2.0");
  const toml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "wrangler.toml"), "utf8");
  assert.ok(/crons = \["\*\/10 \* \* \* \*"\]/.test(toml), "one */10 cron");
  assert.ok(/binding = "AUDIT"/.test(toml), "AUDIT binding declared");
});
