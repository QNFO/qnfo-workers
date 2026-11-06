import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
VER = ('var VERSION = "2.3.0-exuvia"; // 2.3.0 EXUVIA-1 (2026-10-28, pillar reach): exuvia_* MCP tools connect QNFO papers and the '
       'knowledge graph to the Exuvia agent research network (exuvia-two.vercel.app): status, feed, paper-to-post draft, confirmed '
       'publish, KG context for an Exuvia post. EXUVIA_API_KEY is an optional worker secret; without it the tools say so and the '
       'draft and context tools still work. //')
assert 'var VERSION = "2.2.0-no-registrar"; //' in s
s = s.replace('var VERSION = "2.2.0-no-registrar"; //', VER, 1)

tools = r'''  // EXUVIA-1: Exuvia (https://exuvia-two.vercel.app) is a public research network for AI agents. Reads and drafts are open; a publish needs confirm=true and EXUVIA_API_KEY.
  { name: "exuvia_status", description: "Exuvia connection state: whether EXUVIA_API_KEY is set, public platform limits, and (with a key) the agent's /me orientation.", inputSchema: { type: "object", properties: {} } },
  { name: "exuvia_feed", description: "Read recent Exuvia research posts (needs EXUVIA_API_KEY). Use to find posts a QNFO paper or KG node can answer.", inputSchema: { type: "object", properties: { limit: { type: "number", default: 10 }, path: { type: "string", description: "feed | feed/needs-response | feed/follows", default: "feed" } } } },
  { name: "exuvia_paper_post_draft", description: "Build an Exuvia research-post payload (title, abstract, content_markdown, tags, post_type) from a QNFO paper slug, with its knowledge-graph neighbours as a Related section. Nothing is sent.", inputSchema: { type: "object", properties: { slug: { type: "string" }, max_chars: { type: "number", default: 20000 } }, required: ["slug"] } },
  { name: "exuvia_publish_paper", description: "Publish a QNFO paper to Exuvia as a public research post. Public and not agent-deletable: dry-run unless confirm=true. Needs EXUVIA_API_KEY.", inputSchema: { type: "object", properties: { slug: { type: "string" }, confirm: { type: "boolean", default: false }, post_type: { type: "string", default: "research" }, max_chars: { type: "number", default: 20000 } }, required: ["slug"] } },
  { name: "exuvia_kg_context", description: "QNFO papers and knowledge-graph nodes relevant to an Exuvia post (by post id, fetched with the key) or to free text. Use before replying on Exuvia.", inputSchema: { type: "object", properties: { post_id: { type: "string" }, text: { type: "string" }, limit: { type: "number", default: 5 } } } },
'''
assert "var TOOLS = [\n" in s
s = s.replace("var TOOLS = [\n", "var TOOLS = [\n" + tools, 1)

impl = r'''// ---------------------------------------------------------------------------------------------------------------------------
// EXUVIA-1 (2.3.0): bridge to the Exuvia agent research network. The key (EXUVIA_API_KEY) never appears in output; a publish
// is public and has no agent delete route, so it is a dry run unless confirm === true. Exuvia limits: content 50000 chars,
// 10 tags, 2 posts per burst, 150 s cooldown (GET /api/v1/capabilities).
// ---------------------------------------------------------------------------------------------------------------------------
function exBase(env) { return String(env.EXUVIA_BASE || "https://exuvia-two.vercel.app").replace(/\/+$/, ""); }
function exOut(o, err) { return { content: [{ type: "text", text: JSON.stringify(o) }], isError: !!err }; }
async function exFetch(env, path, init) {
  const headers = { Accept: "application/json" };
  if (env.EXUVIA_API_KEY) headers["x-api-key"] = env.EXUVIA_API_KEY;
  if (init && init.body) headers["Content-Type"] = "application/json";
  const r = await fetch(exBase(env) + path, { ...(init || {}), headers });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text.slice(0, 500) }; }
  return { status: r.status, data };
}
async function exPaperDraft(env, slug, maxChars) {
  const paper = await env.LIVING_PAPER.prepare("SELECT slug, title, doi, authors, abstract, body_md FROM papers WHERE slug = ?1 LIMIT 1").bind(slug).first().catch(() => null);
  if (!paper) return { error: "slug not found" };
  const bare = slug.replace(/^paper[:|-]/, "");
  const rows = await env.GRAPH_DB.prepare("SELECT e.relationship_type AS rel, n.id, n.label, n.name FROM edges e JOIN nodes n ON (n.id = CASE WHEN e.source_id IN (?1, ?2, ?3) THEN e.target_id ELSE e.source_id END) WHERE e.source_id IN (?1, ?2, ?3) OR e.target_id IN (?1, ?2, ?3) LIMIT 12").bind(slug, "paper:" + bare, "paper-" + bare).all().catch(() => ({ results: [] }));
  const kg = (rows.results || []).filter((r) => r.name);
  const cap = Math.max(1000, Math.min(parseInt(maxChars, 10) || 20000, 40000));
  let body = String(paper.body_md || paper.abstract || "");
  const truncated = body.length > cap;
  if (truncated) body = body.slice(0, cap).replace(/\s+\S*$/, "") + "\n\n*Excerpt; the full text is linked below.*";
  const doi = nozDoi(paper.doi);
  const tail = ["", "## Related (QNFO knowledge graph)", ...(kg.length ? kg.map((r) => "- " + r.name + " (" + (r.label || "node") + ", " + (r.rel || "related") + ")") : ["- none linked yet"]), "", "Source: QNFO" + (doi ? " [" + doi + "](https://doi.org/" + doi + ")" : " paper `" + paper.slug + "`")].join("\n");
  const abstract = String(paper.abstract || paper.title || "").slice(0, 1500);
  return { post: { title: String(paper.title || slug).slice(0, 300), abstract, content_markdown: (body + "\n" + tail).slice(0, 50000), tags: ["qnfo", "knowledge-graph"], post_type: "research", is_speculative: false }, truncated, kg_neighbours: kg.length, slug: paper.slug };
}
async function tool_exuvia_status(args, env) {
  const cap = await exFetch(env, "/api/v1/capabilities").catch((e) => ({ status: 0, data: { error: String(e && e.message || e) } }));
  const out = { base: exBase(env), key_configured: !!env.EXUVIA_API_KEY, capabilities_status: cap.status, limits: cap.data && cap.data.data && cap.data.data.limits || null };
  if (env.EXUVIA_API_KEY) { const me = await exFetch(env, "/api/v1/me").catch((e) => ({ status: 0, data: { error: String(e && e.message || e) } })); out.me_status = me.status; out.me = me.data && me.data.data || me.data; }
  else out.note = "No EXUVIA_API_KEY: register the agent once (POST /api/v1/agents/spawn) and store data.api_key as the worker secret; drafts and KG context work without it.";
  return exOut(out);
}
async function tool_exuvia_feed(args, env) {
  if (!env.EXUVIA_API_KEY) return exOut({ error: "EXUVIA_API_KEY not set" }, true);
  const path = ["feed", "feed/needs-response", "feed/follows"].includes(args.path) ? args.path : "feed";
  const r = await exFetch(env, "/api/v1/" + path + "?limit=" + fgInt(args.limit, 10, 1, 50));
  return exOut({ status: r.status, data: r.data && r.data.data || r.data }, r.status >= 400);
}
async function tool_exuvia_paper_post_draft(args, env) {
  const slug = sanitize(args.slug);
  if (!slug) return exOut({ error: "slug required" }, true);
  const d = await exPaperDraft(env, slug, args.max_chars);
  return exOut(d, !!d.error);
}
async function tool_exuvia_publish_paper(args, env) {
  const slug = sanitize(args.slug);
  if (!slug) return exOut({ error: "slug required" }, true);
  const d = await exPaperDraft(env, slug, args.max_chars);
  if (d.error) return exOut(d, true);
  if (args.post_type) d.post.post_type = String(args.post_type).slice(0, 30);
  if (args.confirm !== true) return exOut({ dry_run: true, note: "Public and not agent-deletable. Re-call with confirm=true to publish.", post: { ...d.post, content_markdown: d.post.content_markdown.slice(0, 600) + "..." }, truncated: d.truncated });
  if (!env.EXUVIA_API_KEY) return exOut({ error: "EXUVIA_API_KEY not set" }, true);
  const r = await exFetch(env, "/api/v1/posts", { method: "POST", body: JSON.stringify(d.post) });
  return exOut({ status: r.status, slug: d.slug, result: r.data }, r.status >= 400);
}
async function tool_exuvia_kg_context(args, env) {
  let text = sanitize(args.text || "");
  let post = null;
  if (args.post_id && env.EXUVIA_API_KEY) {
    const r = await exFetch(env, "/api/v1/posts/" + encodeURIComponent(String(args.post_id).slice(0, 80)));
    const p = r.data && r.data.data && r.data.data.post;
    if (p) { post = { id: p.id, title: p.title }; text = (String(p.title || "") + ". " + String(p.abstract || "")).slice(0, 1500); }
  }
  if (!text) return exOut({ error: "text, or post_id with EXUVIA_API_KEY, required" }, true);
  const papers = await tool_search_papers({ query: text, limit: args.limit || 5 }, env);
  const word = text.split(/\s+/).filter((w) => w.length > 5)[0] || "";
  const nodes = word ? await env.GRAPH_DB.prepare("SELECT id, label, name FROM nodes WHERE name LIKE ?1 LIMIT 10").bind("%" + word + "%").all().catch(() => ({ results: [] })) : { results: [] };
  let parsed = null; try { parsed = JSON.parse(papers.content[0].text); } catch (e) {}
  return exOut({ post, query: text.slice(0, 200), papers: parsed, kg_nodes: nodes.results || [] });
}
'''
marker = "// ---------------------------------------------------------------------------------------------------------------------------\n// FLEET-GRAPH-1 (2.1.0)"
assert marker in s
s = s.replace(marker, impl + marker, 1)
old = "    get_paper_context: tool_get_paper_context\n  };"
assert old in s
s = s.replace(old, "    get_paper_context: tool_get_paper_context,\n    exuvia_status: tool_exuvia_status,\n    exuvia_feed: tool_exuvia_feed,\n    exuvia_paper_post_draft: tool_exuvia_paper_post_draft,\n    exuvia_publish_paper: tool_exuvia_publish_paper,\n    exuvia_kg_context: tool_exuvia_kg_context\n  };", 1)
open(p, "w", encoding="utf-8", newline="").write(s)
print("patched")
