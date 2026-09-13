// obsidian-writer - Obsidian-vault R2 file writer (radar sink)
// Self-doc (FLEET-SELF-DOC-1): purpose=write markdown notes into R2 obsidian-vault;
// deploy=wrangler deploy (canonical source this dir); bindings=VAULT(r2 obsidian-vault).
const VERSION = "1.1.0";

function json(o, s) {
  return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/health") return json({ ok: true, worker: "obsidian-writer", version: VERSION });
  if (request.method === "OPTIONS") return new Response("ok", { status: 204 });
  if (request.method !== "POST") return new Response("Method Not Allowed - POST only", { status: 405, headers: { "content-type": "text/plain" } });
  let p;
  try { p = await request.json(); } catch { return new Response("invalid json", { status: 400 }); }
  const { slug, section, content, date } = p || {};
  if (!slug || !content) return new Response("slug and content required", { status: 400 });
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : new Date().toISOString().slice(0, 10);
  const [y, m] = d.split("-");
  const key = "notes/v1/" + y + "/" + m + "/" + d + "/_" + slug + "-" + d + ".md";
  const header = "# " + (section || slug) + "\n\n> " + new Date().toISOString() + "\n\n---\n\n## " + (section || slug) + "\n\n";
  const body = header + content;
  await env.VAULT.put(key, body, { httpMetadata: { contentType: "text/markdown" } });
  return json({ ok: true, key: key, bytes: body.length });
}

export default {
  async fetch(request, env) { return handle(request, env); }
};
