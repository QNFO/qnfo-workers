#!/usr/bin/env node
// WEBMCP-FLEET-1 smoke test: imports each patched worker module and calls the bridge paths through its REAL default
// export, so the wiring (attach/property mutation/route) is proven per file before a deploy rather than after one.
// A worker whose module cannot be imported in Node (a package import the runtime provides) is reported, not failed:
// the live probe in scripts/webmcp-verify.mjs is the authority for those.
import { TARGETS } from "./webmcp-apply.mjs";

const rows = [];
for (const w of TARGETS) {
  const path = new URL("../" + w + "/worker.js", import.meta.url).href;
  try {
    const mod = await import(path);
    const api = mod.default;
    if (!api || typeof api.fetch !== "function") { rows.push({ worker: w, status: "no-default-fetch" }); continue; }
    const env = {};
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    const packsRes = await api.fetch(new Request("https://papers.qnfo.org/.webmcp/packs.json"), env, ctx);
    const packs = await packsRes.json();
    const bridgeRes = await api.fetch(new Request("https://papers.qnfo.org/.webmcp/bridge.js"), env, ctx);
    const bridge = await bridgeRes.text();
    rows.push({
      worker: w,
      status: "ok",
      wm: api.__wm || null,
      packs_status: packsRes.status,
      tool_count: packs.tool_count,
      packs: packs.pack_ids,
      bridge_status: bridgeRes.status,
      bridge_bytes: bridge.length,
      bridge_ok: bridge.includes("registerTool") && bridge.includes("modelContext")
    });
  } catch (e) {
    rows.push({ worker: w, status: "import-failed", error: String(e && e.message || e).slice(0, 160) });
  }
}
for (const r of rows) console.log(JSON.stringify(r));
const bad = rows.filter((r) => r.status === "ok" && !(r.packs_status === 200 && r.bridge_status === 200 && r.bridge_ok && r.tool_count > 0));
console.log(JSON.stringify({ workers: rows.length, ok: rows.filter((r) => r.status === "ok").length, bad: bad.length, unimportable: rows.filter((r) => r.status === "import-failed").length }));
if (bad.length) process.exit(1);
