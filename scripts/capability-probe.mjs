#!/usr/bin/env node
// CAPABILITY-ADVERTISING-CONTRACT-1 — external conformance prober.
// WHY: a Cloudflare Worker CANNOT subrequest a sibling *.workers.dev URL
// (IN-WORKER-PROBE-BLOCKED-1: same URL -> 200 via curl, 404 from inside a Worker,
// reproduced from both qnfo-ops and qnfo-ai). The contract's /health reachability
// check therefore MUST run from an executor that can reach workers.dev. This is it.
// Usage: node scripts/capability-probe.mjs [registryUrl]
const REG = process.argv[2] || "https://qnfo-ops.q08.workers.dev/registry";
const out = { contract: "CAPABILITY-ADVERTISING-CONTRACT-1", registry: REG, total: 0, checked: 0, conforming: 0, non_conforming: [], unreachable: [], pending: [] };
const reg = await (await fetch(REG)).json();
const svcs = (reg.registry || []).filter(s => s.base_url);
out.total = svcs.length;
for (const s of svcs) {
  const url = s.base_url.replace(/\/+$/, "") + "/health";
  out.checked++;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "qnfo-capability-probe/1.0" } });
    clearTimeout(t);
    if (!res.ok) { out.unreachable.push({ service: s.service, url, reason: "http:" + res.status }); continue; }
    const j = await res.json().catch(() => null);
    if (!j) { out.unreachable.push({ service: s.service, url, reason: "no-json" }); continue; }
    const caps = Array.isArray(j.capabilities) ? j.capabilities.length : (typeof j.capabilities === "string" && j.capabilities ? j.capabilities.split(",").filter(Boolean).length : 0);
    const lims = Array.isArray(j.limitations) ? j.limitations.length : 0;
    let reason = "";
    if (!lims) reason = "missing-limitations";
    else if (!caps) reason = "empty-capabilities";
    if (reason) out.non_conforming.push({ service: s.service, version: j.version || "", caps, lims, reason });
    else out.conforming++;
  } catch (e) { out.unreachable.push({ service: s.service, url, reason: "unreachable:" + String(e && e.name || e) }); }
}
console.log(JSON.stringify(out, null, 1));
const rows = [
  ...out.non_conforming.map(x => `NC   ${x.service}  v${x.version}  caps=${x.caps} lims=${x.lims}  ${x.reason}`),
  ...out.unreachable.map(x => `UNR  ${x.service}  ${x.reason}`)
].join("\n");
console.error(`\n===== FLEET CAPABILITY CONFORMANCE =====\nconforming=${out.conforming}/${out.checked}  non_conforming=${out.non_conforming.length}  unreachable=${out.unreachable.length}\n${rows}`);
