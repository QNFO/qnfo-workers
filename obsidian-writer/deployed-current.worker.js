// VERSION marker (2026-09-13, qnfo-ops remediation):
// This worker's canonical carried NO version string, so the fleet drift scan recorded
// scanerr:stale-canon and permanently DISABLED drift detection for it: the scanner's
// stale-canon branch copies the deployed body into the R2 canonical and continues, so
// "whatever is deployed" is blessed as canonical and divergence can never be seen.
// (Same defect, same error kind, on research-daily-brief, qnfo-twin-maintain and
// osf-integrity-check — those three are deliberately NOT changed here; see README.md
// section "Deferred siblings (stale-canon)" for the note, which now exists.)
//
// The value is deliberately the DEPLOYED BUILD TAG, not a semver. num() parses a build tag
// to [0], so canonical and deployed compare EQUAL and this line cannot trigger a redeploy.
// A semver like "1.0.0" would parse to [1,0,0] and mark the canonical "ahead", firing a
// heal PUT of this file over production. Do not "tidy" this into a semver.
var VERSION = "obsidian-writer/fabric-20260910";
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
