#!/usr/bin/env node
// WEBMCP-FLEET-1 live verifier (2026-10-25).
//
// WHAT. Proves the standard is actually served on a host, from the host: the page carries the injected module tag,
// /.webmcp/bridge.js answers with the bridge, /.webmcp/packs.json answers with the host's own packs, and every tool
// the manifest advertises has an endpoint that answers 200 for a real sample argument. A manifest entry that 404s is a
// false capability claim, so it fails here rather than in an agent's browser.
//
// USAGE. node scripts/webmcp-verify.mjs                  # every host below
//        node scripts/webmcp-verify.mjs fleet.qnfo.org   # one host
const HOSTS = [
  "qnfo.org", "papers.qnfo.org", "ideas.qnfo.org", "fleet.qnfo.org",
  "q08.org", "mind.q08.org", "ipatent.qnfo.org", "ask.qwav.tech",
  "qwav.tech", "archive.qnfo.org", "reading.q08.org"
];
const SECTION = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const targets = SECTION.length ? SECTION : HOSTS;
const TIMEOUT = 20000;

// A real sample per tool, so the probe is a call an agent could make, not a shape test.
const SAMPLE = {
  search_papers: { q: "p-adic", limit: 1 },
  get_paper: { slug: "ultrametric-intelligence" },
  get_paper_markdown: { slug: "ultrametric-intelligence", max_chars: 400 },
  get_paper_digest: { slug: "ultrametric-intelligence" },
  read_page: { path: "/", max_chars: 400 },
  list_site_pages: { limit: 5 },
  ask_corpus: { q: "ultrametric" }
};

function fill(tpl, args) {
  return String(tpl || "").replace(/\{([a-z0-9_]+)\}/gi, (m, k) => (args && args[k] != null ? String(args[k]) : ""));
}

async function get(url, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, Object.assign({ signal: ctl.signal, redirect: "follow" }, init || {}));
    const body = await r.text();
    return { status: r.status, ct: r.headers.get("content-type") || "", wm: r.headers.get("x-webmcp") || "", body };
  } finally { clearTimeout(t); }
}

const rows = [];
for (const host of targets) {
  const row = { host, page: null, tag: false, wm_header: "", bridge: null, packs: null, tool_count: 0, ends: [], failed_ends: [] };
  try {
    const page = await get("https://" + host + "/");
    row.page = page.status;
    row.wm_header = page.wm;
    row.tag = page.body.includes("/.webmcp/bridge.js") && page.body.includes("data-webmcp");
    const br = await get("https://" + host + "/.webmcp/bridge.js");
    row.bridge = br.status;
    row.bridge_ok = br.status === 200 && br.body.includes("registerTool") && br.body.includes("modelContext");
    const pk = await get("https://" + host + "/.webmcp/packs.json");
    row.packs = pk.status;
    if (pk.status === 200) {
      const man = JSON.parse(pk.body);
      row.manifest_host = man.host;
      row.pack_ids = man.pack_ids;
      row.tool_count = man.tool_count;
      for (const p of man.packs || []) {
        for (const tool of p.tools || []) {
          if (!tool.request) { row.ends.push(tool.name + "=local"); continue; }
          const args = SAMPLE[tool.name] || {};
          const path = fill(tool.request.path, args);
          const qs = new URLSearchParams();
          if (tool.request.query) for (const k of Object.keys(tool.request.query)) {
            const v = args[k] != null ? args[k] : null;
            if (v !== null) qs.set(k, fill(tool.request.query[k], args));
          }
          const url = "https://" + host + path + (qs.toString() ? "?" + qs.toString() : "");
          const init = { method: tool.request.method || "GET" };
          if (init.method === "POST") { init.headers = { "content-type": "application/json" }; init.body = JSON.stringify(args); }
          const r = await get(url, init);
          const ok = r.status >= 200 && r.status < 400;
          (ok ? row.ends : row.failed_ends).push(tool.name + "=" + r.status);
        }
      }
    }
  } catch (e) {
    row.error = String(e && e.message || e).slice(0, 160);
  }
  rows.push(row);
}
for (const r of rows) console.log(JSON.stringify(r));
const bad = rows.filter((r) => !(r.page === 200 && r.tag && r.bridge_ok && r.packs === 200 && r.tool_count > 0 && r.failed_ends.length === 0));
console.log(JSON.stringify({ hosts: rows.length, passing: rows.length - bad.length, failing: bad.length, failing_hosts: bad.map((b) => b.host) }));
if (bad.length) process.exit(1);
