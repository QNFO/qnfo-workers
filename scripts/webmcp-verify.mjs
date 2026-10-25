#!/usr/bin/env node
// WEBMCP-FLEET-1 live verifier (2026-10-25).
//
// WHAT. Proves the standard is actually served: worker-owned hosts have the injected tag and bridge, while platform
// hosts expose the same tools through /mcp. Every host must serve its API manifest, match the /mcp tool list, and answer
// a real sample call for each advertised HTTP tool. A manifest entry that fails is a false capability claim.
//
// USAGE. node scripts/webmcp-verify.mjs                  # every host below
//        node scripts/webmcp-verify.mjs fleet.qnfo.org   # one host
const HOSTS = [
  "qnfo.org", "papers.qnfo.org", "ideas.qnfo.org", "fleet.qnfo.org",
  "q08.org", "mind.q08.org", "ipatent.qnfo.org", "ask.qwav.tech",
  "qwav.tech", "archive.qnfo.org", "reading.q08.org"
];
const MANIFEST_PATH = "/api/webmcp/manifest.json";
const MCP_PATH = "/mcp";
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
  search_disclosures: { q: "quantum" },
  ask_corpus: { q: "ultrametric" }
};

function usesPlatformBridge(host) {
  return host === "qnfo.org" || host.endsWith(".qnfo.org");
}

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
  const platformBridge = usesPlatformBridge(host);
  const row = { host, bridge_mode: platformBridge ? "platform" : "worker", page: null, tag: false, wm_header: "", bridge: null, manifest: null, mcp: null, tool_count: 0, ends: [], failed_ends: [] };
  try {
    const page = await get("https://" + host + "/", {
      headers: { accept: "text/html,application/xhtml+xml", "sec-fetch-dest": "document" }
    });
    row.page = page.status;
    row.wm_header = page.wm;
    row.tag = page.body.includes("/.webmcp/bridge.js") && page.body.includes("data-webmcp");
    if (platformBridge) {
      row.platform_tag_ok = page.body.includes("/.webmcp/bridge.js") && page.body.includes("mcp-server-client");
    } else {
      const br = await get("https://" + host + "/.webmcp/bridge.js");
      row.bridge = br.status;
      row.bridge_ok = br.status === 200 && br.body.includes("registerTool") && br.body.includes("modelContext");
    }
    const manifestResponse = await get("https://" + host + MANIFEST_PATH);
    row.manifest = manifestResponse.status;
    if (manifestResponse.status === 200) {
      const man = JSON.parse(manifestResponse.body);
      if (!platformBridge) row.tag_ok = row.tag && page.wm === man.version;
      row.manifest_host = man.host;
      row.pack_ids = man.pack_ids;
      row.tool_count = man.tool_count;
      const manifestTools = [];
      for (const p of man.packs || []) {
        for (const tool of p.tools || []) {
          manifestTools.push(tool.name);
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
          const hasExtractedLocations = tool.request.extract !== "loc" || /<loc>[^<]+<\/loc>/i.test(r.body);
          const ok = r.status >= 200 && r.status < 400 && hasExtractedLocations;
          (ok ? row.ends : row.failed_ends).push(tool.name + "=" + r.status + (hasExtractedLocations ? "" : ":no-loc"));
        }
      }
      row.manifest_tool_count_ok = manifestTools.length === man.tool_count;
      const card = await get("https://" + host + MCP_PATH);
      const toolList = await get("https://" + host + MCP_PATH, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      });
      const cardBody = card.status === 200 ? JSON.parse(card.body) : {};
      const listedTools = toolList.status === 200 ? JSON.parse(toolList.body).result.tools.map((tool) => tool.name) : [];
      const sorted = (names) => names.slice().sort();
      row.mcp = card.status === 200 && card.wm === man.version && cardBody.tool_count === man.tool_count && toolList.status === 200;
      row.mcp_tool_count = listedTools.length;
      row.mcp_tools_match = JSON.stringify(sorted(listedTools)) === JSON.stringify(sorted(manifestTools));
      row.manifest_host_ok = man.host === host;
    }
  } catch (e) {
    row.error = String(e && e.message || e).slice(0, 160);
  }
  rows.push(row);
}
for (const r of rows) console.log(JSON.stringify(r));
const bad = rows.filter((r) => !(r.page === 200 && (r.bridge_mode === "platform" ? r.platform_tag_ok : (r.tag_ok && r.bridge_ok)) && r.manifest === 200 && r.manifest_host_ok && r.tool_count > 0 && r.manifest_tool_count_ok && r.mcp && r.mcp_tools_match && r.failed_ends.length === 0));
console.log(JSON.stringify({ hosts: rows.length, passing: rows.length - bad.length, failing: bad.length, failing_hosts: bad.map((b) => b.host) }));
if (bad.length) process.exit(1);
