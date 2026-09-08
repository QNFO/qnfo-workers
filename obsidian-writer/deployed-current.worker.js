addEventListener("fetch", (event) => { event.respondWith(handle(event.request)); });
async function handle(request) {
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
  await VAULT.put(key, body, { httpMetadata: { contentType: "text/markdown" } });
  return new Response(JSON.stringify({ ok: true, key: key, bytes: body.length }), { headers: { "content-type": "application/json" } });
}