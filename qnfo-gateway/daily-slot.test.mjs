// GATEWAY-DAILY-SLOT-1 (qnfo-gateway 3.43.3): the 06:00 daily bundle must not run on the hourly fire.
// CRON_GRID_CFG lists two jobs ("0 6 * * *" and "0 * * * *") that share one runner, gatewayDaily. Measured 2026-10-26:
// 38 papers.qnfo.org IndexNow runs and 11,174 URLs in one day (77 to 89 URLs once a day before 2026-10-20), http 429 from
// api.indexnow.org, bing.com and seznam, the render-health sweep and the Browser Run math sample hourly.
// Run: node --test qnfo-gateway/daily-slot.test.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const dir = mkdtempSync(join(tmpdir(), "gwd-"));
writeFileSync(join(dir, "w.mjs"), src + "\nexport { gatewayDaily, collectPaperUrls, indexNowEnginesAccepted, seoPublishMetrics, CRON_GRID_CFG, GATEWAY_HOURLY_CRON, GATEWAY_DELTA_MINUTES };\n");
const mod = await import(pathToFileURL(join(dir, "w.mjs")).href);
const { gatewayDaily, collectPaperUrls, indexNowEnginesAccepted, seoPublishMetrics, CRON_GRID_CFG, GATEWAY_HOURLY_CRON, GATEWAY_DELTA_MINUTES } = mod;
const gw = mod.default;

const RealDate = Date;
function atTime(iso, fn) {
  const t = new RealDate(iso).getTime();
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } };
  return Promise.resolve().then(fn).finally(() => { globalThis.Date = RealDate; });
}

function mkEnv(opts) {
  opts = opts || {};
  const o = { sqls: [], logs: [], pdf: [], batches: 0, dash: {}, fires: [] };
  const lpStmt = (sql) => {
    const st = {
      a: [],
      bind(...a) { st.a = a; return st; },
      async all() {
        o.sqls.push(sql);
        if (/FROM indexnow_log WHERE ts >=/.test(sql)) return { results: (opts.logRows || []).map((d) => ({ detail: d })) };
        if (/FROM papers WHERE slug IS NOT NULL AND status IN \('published'/.test(sql)) {
          return { results: /minutes/.test(sql) ? (opts.deltaRows || []) : [{ slug: "p-one", created_at: "2026-10-26 01:00:00" }, { slug: "p-two", created_at: "2026-10-25 01:00:00" }] };
        }
        if (/SELECT rowid AS rid, slug, title, body_md/.test(sql)) return { results: Number(st.a[0]) < 1 ? [{ rid: 1, slug: "p-one", title: "T", body_md: "x".repeat(80), render_defects: 0 }] : [] };
        if (/LIMIT \?3/.test(sql)) return { results: Array.from({ length: Number(st.a[2]) }, (_, i) => ({ rid: Number(st.a[0]) + i + 1, slug: "p" + (Number(st.a[0]) + i + 1) })) };
        return { results: [] };
      },
      async first() {
        o.sqls.push(sql);
        if (/FROM indexnow_log ORDER BY ts DESC LIMIT 1/.test(sql)) return opts.latestRow === undefined ? null : { detail: opts.latestRow };
        return { days: 3, g: 4, b: 5, n: 7, checked: 0, last: null };
      },
      async run() {
        o.sqls.push(sql);
        if (/INSERT INTO indexnow_log/.test(sql)) o.logs.push({ host: st.a[0], urls: st.a[1], accepted: st.a[2] });
        return { success: true };
      }
    };
    return st;
  };
  const audit = (sql) => {
    const st = {
      a: [],
      bind(...a) { st.a = a; return st; },
      async all() { return { results: [] }; },
      async first() { return { n: 0, last_ok: null, fails: 0 }; },
      async run() {
        if (/INSERT INTO analytics_dash_meta/.test(sql)) o.dash[st.a[0]] = st.a[1];
        if (/INSERT INTO cron_fire_log/.test(sql)) o.fires.push({ expr: st.a[2], outcome: st.a[5], note: st.a[7] });
        return { success: true };
      }
    };
    return st;
  };
  o.env = {
    LIVING_PAPER: { prepare: lpStmt, async batch(list) { o.batches++; return list.map(() => ({ success: true })); } },
    AUDIT: { prepare: audit },
    RELEASES: { async get() { return null; }, async put() {} },
    PDF_SVC: { async fetch(u) { o.pdf.push(String(u)); return new Response(JSON.stringify({ ok: true, typeset: 1, errors: 0, raw_dollar: 0, pseudo_residual: 0, pass: true }), { headers: { "Content-Type": "application/json" } }); } }
  };
  return o;
}

function mockFetch() {
  const posts = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (/indexnow/.test(String(url))) { posts.push({ url: String(url), body: JSON.parse(init.body) }); return new Response("", { status: 202 }); }
    return new Response("", { status: 404 });
  };
  posts.restore = () => { globalThis.fetch = real; };
  return posts;
}

const cx = { waitUntil() {} };

test("the hourly fire with no fresh paper submits nothing, logs nothing, renders nothing", async () => {
  const o = mkEnv({ deltaRows: [] });
  const posts = mockFetch();
  try {
    await atTime("2026-10-26T07:00:00Z", () => gatewayDaily({ cron: "0 * * * *" }, o.env, cx)); // a Monday
  } finally { posts.restore(); }
  assert.equal(posts.length, 0, "no IndexNow POST on an empty delta");
  assert.equal(o.logs.length, 0, "no indexnow_log row on an empty delta");
  assert.equal(o.batches, 0, "renderHealthSweep did not run");
  assert.equal(o.pdf.length, 0, "browserMathSample did not run");
  assert.ok(o.sqls.some((s) => /created_at >= datetime\('now','-90 minutes'\)/.test(s)), "the delta window is 90 minutes");
  assert.ok(!o.sqls.some((s) => /DELETE FROM seo_crawl_log/.test(s)), "the crawl-log prune is a daily step");
  assert.ok("seo_indexnow_engines_ok" in o.dash, "the hourly fire still republishes the SEO metrics");
});

test("the hourly fire pings only the fresh papers, never the base pages or the qnfo.org core pages", async () => {
  const o = mkEnv({ deltaRows: [{ slug: "fresh-1" }, { slug: "fresh-2" }] });
  const posts = mockFetch();
  try {
    await atTime("2026-10-26T08:00:00Z", () => gatewayDaily({ cron: "0 * * * *" }, o.env, cx)); // Monday: the weekly pass must not fire here
  } finally { posts.restore(); }
  assert.ok(posts.length > 0 && posts.every((p) => p.body.host === "papers.qnfo.org"), "papers host only", posts.map((p) => p.body.host));
  for (const p of posts) assert.deepEqual(p.body.urlList, ["https://papers.qnfo.org/papers/fresh-1", "https://papers.qnfo.org/papers/fresh-2"]);
  assert.equal(o.logs.length, 1, "one logged submission");
  assert.equal(o.logs[0].urls, 2);
  assert.equal(o.batches, 0);
  assert.equal(o.pdf.length, 0);
});

test("the 06:00 job on a Monday does the whole daily bundle exactly once", async () => {
  const o = mkEnv({ deltaRows: [] });
  const posts = mockFetch();
  try {
    await atTime("2026-10-26T06:00:00Z", () => gatewayDaily({ cron: "0 6 * * *" }, o.env, cx));
  } finally { posts.restore(); }
  const hosts = posts.map((p) => p.body.host);
  assert.ok(hosts.includes("papers.qnfo.org") && hosts.includes("qnfo.org"), "papers and qnfo.org core pages", hosts);
  assert.equal(o.logs.length, 3, "7-day window, qnfo.org core, Monday full pass");
  assert.ok(o.batches >= 1, "renderHealthSweep ran");
  assert.equal(o.pdf.length, 5, "five math-check pages");
  assert.ok(o.sqls.some((s) => /DELETE FROM seo_crawl_log/.test(s)), "crawl-log prune ran");
});

test("a Tuesday 06:00 run skips the Monday blocks", async () => {
  const o = mkEnv();
  const posts = mockFetch();
  try {
    await atTime("2026-10-27T06:00:00Z", () => gatewayDaily({ cron: "0 6 * * *" }, o.env, cx));
  } finally { posts.restore(); }
  assert.equal(o.logs.length, 1);
  assert.ok(posts.every((p) => p.body.host === "papers.qnfo.org"));
});

test("a manual or non-grid fire (no cron on the event) is the daily bundle", async () => {
  for (const ev of [{}, undefined, { cron: "manual" }]) {
    const o = mkEnv();
    const posts = mockFetch();
    try {
      await atTime("2026-10-27T09:00:00Z", () => gatewayDaily(ev, o.env, cx));
    } finally { posts.restore(); }
    assert.equal(o.pdf.length, 5, "browser sample ran for " + JSON.stringify(ev));
    assert.ok(o.batches >= 1);
    assert.ok(o.logs.length >= 1);
  }
});

test("scheduled(): at 07:00 only the hourly job is due; at 06:00 the daily work runs once, not twice", async () => {
  const hourly = mkEnv({ deltaRows: [] });
  let posts = mockFetch();
  try {
    await atTime("2026-10-26T07:00:00Z", () => gw.scheduled({ cron: GATEWAY_HOURLY_CRON, scheduledTime: new RealDate("2026-10-26T07:00:00Z").getTime() }, hourly.env, cx));
  } finally { posts.restore(); }
  assert.equal(posts.length, 0, "07:00 Monday: nothing submitted");
  assert.equal(hourly.pdf.length, 0);
  assert.equal(hourly.batches, 0);
  assert.deepEqual(hourly.fires.map((f) => f.outcome), ["running", "ok"], "the hourly invocation heartbeat precedes its completed job record");

  const six = mkEnv({ deltaRows: [] });
  posts = mockFetch();
  try {
    await atTime("2026-10-26T06:00:00Z", () => gw.scheduled({ cron: GATEWAY_HOURLY_CRON, scheduledTime: new RealDate("2026-10-26T06:00:00Z").getTime() }, six.env, cx));
  } finally { posts.restore(); }
  assert.equal(six.pdf.length, 5, "the math sample ran once, from the daily job only");
  assert.equal(six.fires.filter((f) => f.outcome === "ok").length, 2, "both jobs were due and both ran ok");
  assert.equal(six.logs.length, 3, "one 7-day window, one qnfo.org core, one Monday full pass; the hourly job added no row");
});

test("scheduled(): the heartbeat is written before a blocked reader-report sweep", async () => {
  const o = mkEnv({ deltaRows: [] });
  let markEntered, unblock;
  const entered = new Promise((resolve) => { markEntered = resolve; });
  const blocked = new Promise((resolve) => { unblock = resolve; });
  const prepare = o.env.AUDIT.prepare;
  o.env.AUDIT.prepare = (sql) => {
    const st = prepare(sql);
    if (/SELECT id FROM reader_reports/.test(sql)) {
      const all = st.all;
      st.all = async () => { markEntered(); await blocked; return all(); };
    }
    return st;
  };
  await atTime("2026-10-26T07:00:00Z", async () => {
    const run = gw.scheduled({ cron: GATEWAY_HOURLY_CRON, scheduledTime: new RealDate("2026-10-26T07:00:00Z").getTime() }, o.env, cx);
    await entered;
    assert.deepEqual(o.fires.map((f) => f.outcome), ["running"], "the cron entry is recorded while reader-report work is still blocked");
    assert.equal(o.fires[0].note, "scheduled invocation started");
    unblock();
    await run;
  });
});

test("collectPaperUrls: a delta carries no base pages and uses minutes, not days", async () => {
  const o = mkEnv({ deltaRows: [{ slug: "a b" }] });
  const delta = await collectPaperUrls(o.env, null, 90);
  assert.deepEqual(delta, ["https://papers.qnfo.org/papers/a%20b"]);
  const week = await collectPaperUrls(o.env, 7);
  assert.equal(week[0], "https://papers.qnfo.org/");
  assert.equal(week[1], "https://papers.qnfo.org/papers");
  assert.ok(o.sqls.some((s) => /-7 days/.test(s)));
  assert.equal(GATEWAY_DELTA_MINUTES, 90);
});

const ep = (e, status, extra) => Object.assign({ ep: e, status }, extra || {});
// The stored shape: the chunk row names the first endpoint that accepted (indexNowSubmit), else status 429 and no ep.
const detail = (eps) => {
  const hit = eps.find((e) => Number(e.status) > 0 && Number(e.status) < 400);
  return JSON.stringify([hit ? { chunk: 100, ep: hit.ep, status: hit.status, eps } : { chunk: 100, status: 429, eps }]);
};
const Y = "https://yandex.com/indexnow", R = "https://api.indexnow.org/indexnow", B = "https://www.bing.com/indexnow", S = "https://search.seznam.cz/indexnow", N = "https://searchadvisor.naver.com/indexnow";

test("indexNowEnginesAccepted: a throttled newest run does not hide an accepting earlier run", () => {
  const throttled = detail([ep(Y, 200), ep(R, "unreachable", { error: "http 429" }), ep(B, "unreachable", { error: "http 429" }), ep(S, "unreachable", { error: "http 429" }), ep(N, 200)]);
  const good = detail([ep(Y, 200), ep(R, "unreachable", { error: "http 429" }), ep(B, "unreachable", { error: "http 429" }), ep(S, 200), ep(N, 200)]);
  assert.deepEqual(indexNowEnginesAccepted([throttled]), { count: 2, unknown: false });
  assert.deepEqual(indexNowEnginesAccepted([throttled, good]), { count: 3, unknown: false });
  assert.deepEqual(indexNowEnginesAccepted([]), { count: 0, unknown: false });
});

test("indexNowEnginesAccepted: a truncated detail still counts what it shows; an unreadable one is unknown, not zero", () => {
  const truncated = detail([ep(Y, 200), ep(S, 200)]).slice(0, 150); // cut mid-object: JSON.parse throws, the raw count finds yandex
  assert.equal(indexNowEnginesAccepted([truncated]).count, 1);
  assert.equal(indexNowEnginesAccepted([truncated]).unknown, false);
  const garbage = "[{\"chunk\":100,\"ep\":\"https://yand";
  assert.deepEqual(indexNowEnginesAccepted([garbage]), { count: 0, unknown: true });
  assert.deepEqual(indexNowEnginesAccepted([garbage, detail([ep(Y, 200)])]), { count: 1, unknown: false });
  // every engine refused in a readable detail is a real zero
  assert.deepEqual(indexNowEnginesAccepted([detail([ep(Y, "unreachable"), ep(R, "unreachable")])]), { count: 0, unknown: false });
});

test("seoPublishMetrics publishes the 26-hour union, falls back to the newest row, and withholds an unknown", async () => {
  const throttled = detail([ep(Y, 200), ep(R, "unreachable"), ep(B, "unreachable"), ep(S, "unreachable"), ep(N, 200)]);
  const good = detail([ep(Y, 200), ep(R, "unreachable"), ep(B, "unreachable"), ep(S, 200), ep(N, 200)]);
  let o = mkEnv({ logRows: [throttled, good] });
  await seoPublishMetrics(o.env);
  assert.equal(o.dash.seo_indexnow_engines_ok, "3");
  assert.ok(o.sqls.some((s) => /ts >= datetime\('now','-26 hours'\)/.test(s)));
  o = mkEnv({ logRows: [], latestRow: throttled });
  await seoPublishMetrics(o.env);
  assert.equal(o.dash.seo_indexnow_engines_ok, "2", "no row in the window: the newest row, as before");
  o = mkEnv({ logRows: ["[{\"chunk\":1,\"ep\":\"https://yand"] });
  await seoPublishMetrics(o.env);
  assert.equal(o.dash.seo_indexnow_engines_ok, "", "unparseable and nothing recoverable: no value, not 0");
  assert.equal(o.dash.seo_papers_public, "7", "the other keys are unchanged");
});

test("source gates: the daily steps sit behind hourlyOnly and the grid config is unchanged", () => {
  assert.equal(GATEWAY_HOURLY_CRON, "0 * * * *");
  assert.deepEqual(CRON_GRID_CFG.jobs.map((j) => j.cron), ["0 6 * * *", "0 * * * *"]);
  const fn = src.slice(src.indexOf("async function gatewayDaily"), src.indexOf("// ---- CRON-GRID-1:BEGIN"));
  assert.ok(fn.includes('var hourlyOnly = String(event && event.cron || "") === GATEWAY_HOURLY_CRON;'));
  const iRender = fn.indexOf("await renderHealthSweep(env)"), iBrowser = fn.indexOf("await browserMathSample(env)"), iGate = fn.indexOf("if (!hourlyOnly) {");
  assert.ok(iGate > 0 && iRender > iGate && iBrowser > iGate, "render sweep and browser sample are inside the gate");
  for (const hourly of ["await seoPublishMetrics(env)", "await askRatePrune(env)", "await qrPrune(env)", "await plainFill(env)", "await fileUnreadPapers(env, 24)"]) {
    const i = fn.indexOf(hourly);
    assert.ok(i > 0, hourly + " still present");
    assert.ok(i < iGate || i > fn.indexOf("await browserMathSample(env)"), hourly + " is not gated");
  }
});
