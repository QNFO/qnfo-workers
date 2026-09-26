const VERSION = "1.1.0";
const CORS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const TOOLS = [
  { name: "skills_list", description: "List QNFO skills available server-side (R2 qnfo-skills).", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "skills_get", description: "Return the full SKILL.md text for a named skill.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false } }
];
function j(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: CORS }); }
async function listSkills(env) {
  if (!env.SKILLS_BUCKET) return { ok: false, error: "SKILLS_BUCKET binding missing" };
  const out = [];
  const top = await env.SKILLS_BUCKET.list({ delimiter: "/" });
  for (const p of (top.delimitedPrefixes || [])) {
    const name = p.replace(/\/$/, "");
    if (name.charAt(0) === "_" || name === "READY-FOR-SYNC") continue;
    const h = await env.SKILLS_BUCKET.head(name + "/SKILL.md");
    if (h) { out.push({ name: name, key: name + "/SKILL.md", size: h.size }); continue; }
    const sub = await env.SKILLS_BUCKET.list({ prefix: p, delimiter: "/" });
    for (const sp of (sub.delimitedPrefixes || [])) {
      const sname = sp.replace(/\/$/, "");
      const sh = await env.SKILLS_BUCKET.head(sname + "/SKILL.md");
      if (sh) out.push({ name: sname, key: sname + "/SKILL.md", size: sh.size });
    }
  }
  out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return { ok: true, count: out.length, skills: out };
}
async function getSkill(env, name) {
  if (!env.SKILLS_BUCKET) return { ok: false, error: "SKILLS_BUCKET binding missing" };
  const safe = String(name || "").replace(/[^a-zA-Z0-9._/-]/g, "").replace(/^\/+/, "");
  if (!safe) return { ok: false, error: "name required" };
  let key = safe.slice(-9) === "SKILL.md" ? safe : safe + "/SKILL.md";
  let o = await env.SKILLS_BUCKET.get(key);
  if (!o) { key = "prompts/skills/" + safe + "/SKILL.md"; o = await env.SKILLS_BUCKET.get(key); }
  if (!o) return { ok: false, error: "not found: " + safe };
  const content = await o.text();
  return { ok: true, name: safe, key: key, bytes: content.length, content: content };
}
async function rpc(env, req) {
  const id = req && req.id !== undefined ? req.id : null;
  const m = req && req.method;
  const p = (req && req.params) || {};
  if (m === "initialize") return { jsonrpc: "2.0", id: id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "qnfo-skills-mcp", version: VERSION } } };
  if (m === "tools/list") return { jsonrpc: "2.0", id: id, result: { tools: TOOLS } };
  if (m === "ping") return { jsonrpc: "2.0", id: id, result: {} };
  if (m === "notifications/initialized") return null;
  if (m === "tools/call") {
    const tool = p.name, a = p.arguments || {};
    let out;
    if (tool === "skills_list") out = await listSkills(env);
    else if (tool === "skills_get") out = await getSkill(env, a.name);
    else return { jsonrpc: "2.0", id: id, error: { code: -32601, message: "unknown tool: " + tool } };
    return { jsonrpc: "2.0", id: id, result: { content: [{ type: "text", text: JSON.stringify(out) }], isError: !out.ok } };
  }
  return { jsonrpc: "2.0", id: id, error: { code: -32601, message: "method not found: " + m } };
}
export default {
  async fetch(request, env, ctx) {
    const u = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (u.pathname === "/" || u.pathname === "/health") return j({ worker: "qnfo-skills-mcp", version: VERSION, status: "ok", source: "r2:qnfo-skills", tools: TOOLS.map(function (t) { return t.name; }), bindings: { r2: !!env.SKILLS_BUCKET } });
    if (u.pathname === "/mcp" && request.method === "POST") {
      let body = null;
      try { body = await request.json(); } catch (e) { return j({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400); }
      if (Array.isArray(body)) { const rs = []; for (const x of body) { const rr = await rpc(env, x); if (rr) rs.push(rr); } return j(rs); }
      const rr = await rpc(env, body);
      if (!rr) return new Response(null, { status: 202, headers: CORS });
      return j(rr);
    }
    return j({ error: "not found", routes: ["/health", "/mcp"] }, 404);
  }
};
