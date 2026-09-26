// qnfo-social - cloud-based Bluesky posting (AT Protocol) + AI compose with link facets.
// v0.7.0-LINKS (2026-09-16): postText emits app.bsky.richtext.facet#link facets (UTF-8 byte offsets) for
//   every URL; root posts carry app.bsky.embed.external link cards; /repost + /delete admin routes for
//   link remediation; auth accepts X-Ops-Key (OPS_KEY secret); autoScan+compose prompts demand full
//   https:// URLs (never bare DOIs); truncateSafe never splits a URL at the 290-char boundary.
// History: v0.6.0 DRAIN-QUOTA-1 (2026-09-15) drain matched to production rate + crashed-run reclaim +
//   failed-retry sweep + daily cap. v0.5.3-checker-failclosed (2026-09-13): checker returns null (not [])
//   when unavailable -> draft. v0.5.2-checker-heal (2026-09-08): tolerant JSON parse + strict retry +
//   agent_issue escalation. FIX 2026-09-15: checker max_tokens 1000->3000 for the reasoning model.
// Secrets: BSKY_HANDLE, BSKY_APP_PASS, SOCIAL_TOKEN, GATEWAY_SOCIAL_TOKEN, BUFFER_TOKEN, OPS_KEY.
// D1: DB (qnfo-audit.social_threads). AI: env.AI.

var VERSION = '0.7.13-suppress-nonpublished';
const BSKY = 'https://bsky.social/xrpc';
const COMPOSE_MODEL = '@cf/deepseek-ai/deepseek-v4-flash-0731';
const CHECKER_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'; // non-reasoning for strict JSON extraction (deepseek-v4-flash emits reasoning prose)

function truncate(text, max) {
  const pts = Array.from(String(text || ''));
  if (pts.length <= max) return String(text || '');
  return pts.slice(0, max).join('');
}

// Like truncate but never leaves a URL split in half at the cut boundary.
function truncateSafe(text, max) {
  const s = String(text || '');
  const pts = Array.from(s);
  if (pts.length <= max) return s;
  let cut = pts.slice(0, max).join('');
  cut = cut.replace(/https?:\/\/\S*$/, '').trimEnd();
  return cut;
}
function byteLen(s) {
  return new TextEncoder().encode(String(s || '')).length;
}
function extractUrls(text) {
  const urls = [];
  const re = /https?:\/\/[^\s"'<>()\[\]{}]+/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(text)) !== null) {
    const u = m[0].replace(/[.,;:!?]+$/, '');
    if (!seen.has(u)) { seen.add(u); urls.push(u); }
  }
  return urls;
}
// Build link facets with UTF-8 byte offsets (Bluesky requires byte indices, not char indices).
function buildFacets(text) {
  const s = String(text || '');
  const urls = extractUrls(s);
  const facets = [];
  for (const u of urls) {
    const idx = s.indexOf(u);
    if (idx < 0) continue;
    const byteStart = byteLen(s.slice(0, idx));
    const byteEnd = byteStart + byteLen(u);
    facets.push({
      $type: 'app.bsky.richtext.facet',
      index: { byteStart: byteStart, byteEnd: byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: u }]
    });
  }
  return facets;
}
function findDoi(text) {
  const m = String(text || '').match(/(?:doi:?\s*)?(10\.\d{4,9}\/[^\s"'<>)\]]+)/i);
  if (!m) return null;
  return m[1].replace(/[.,;]+$/, '');
}
// Attach a link to a headline: replace a bare DOI with its URL, else append the URL.
function applyLink(text, link, max) {
  max = max || 290;
  const s = String(text || '');
  if (!link) return truncateSafe(s, max);
  if (s.includes(link)) return truncateSafe(s, max);
  const doi = findDoi(s);
  if (doi && ('https://doi.org/' + doi) === link) {
    return truncateSafe(s.replace(/doi:?\s*10\.\d{4,9}\/[^\s"'<>)\]]+/i, link), max);
  }
  const budget = max - link.length - 3;
  const head = truncateSafe(s, Math.max(budget, 1));
  return head + ' \u2014 ' + link;
}

// Buffer (Mastodon/LinkedIn/X) publishes ONE standalone post with no thread, no facets and
// no embed. A Bluesky thread's post[0] is often a bare noun-phrase title ("Redundant
// Safeguards as Coupled Failure Modes") which is fine as a thread root but incoherent as a
// standalone cross-post. BUFFER-STANDALONE-1: prefer the first post that reads as a complete
// sentence, then attach the link. Falls back to title/post[0] + link so a link is always
// present. Bluesky composition is untouched.
function isCompleteSentence(t) {
  const s = String(t || '').trim();
  if (s.length < 25) return false;
  if (!/[.?!]["')\]]?$/.test(s)) return false;
  return /\s/.test(s);
}
function pickBufferText(posts, link, title, max) {
  max = max || 280;
  const list = (posts || []).map(function(p) { return typeof p === 'string' ? p : String((p && p.text) || ''); });
  const stripped = list.map(function(t) { return String(t).replace(/^\s*(Read|Paper|DOI)\s*:\s*/i, '').trim(); });
  // 1. first post that stands alone as a sentence and is not just a bare link line
  for (let i = 0; i < stripped.length; i++) {
    const t = stripped[i];
    if (!t) continue;
    const withoutUrl = t.replace(/https?:\/\/\S+/g, '').trim();
    if (withoutUrl.length < 25) continue;
    if (isCompleteSentence(withoutUrl)) return link ? applyLink(t, link, max) : truncate(t, max);
  }
  // 2. fall back to the thread title (or post 0), always link-bearing
  const head = String(title || list[0] || '').trim();
  return link ? applyLink(head, link, max) : truncate(head, max);
}

function auth(req, env) {
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const ops = req.headers.get('X-Ops-Key') || '';
  const eq = (a, b) => {
    if (!a || !b || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  };
  if (tok && (eq(tok, env.SOCIAL_TOKEN) || eq(tok, env.GATEWAY_SOCIAL_TOKEN))) return true;
  if (ops && eq(ops, env.OPS_KEY)) return true;
  return false;
}

async function session(env) {
  const r = await fetch(BSKY + '/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (qnfo-social)' },
    body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASS })
  });
  if (!r.ok) throw new Error('session ' + r.status);
  return r.json();
}

async function postText(s, text, reply, opts) {
  opts = opts || {};
  const record = { text: truncateSafe(text, 290), createdAt: (opts.createdAt || new Date().toISOString()) };
  if (reply) record.reply = reply;
  const facets = buildFacets(record.text);
  if (facets.length) record.facets = facets;
  if (opts.embed && facets.length) {
    record.embed = {
      $type: 'app.bsky.embed.external',
      external: {
        uri: facets[0].features[0].uri,
        title: String(opts.embed.title || 'QNFO').slice(0, 300),
        description: String(opts.embed.desc || 'QNFO research').slice(0, 1000)
      }
    };
  }
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(BSKY + '/com.atproto.repo.createRecord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (qnfo-social)', 'Authorization': 'Bearer ' + s.accessJwt },
      body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record: record })
    });
    if (r.status === 429 || r.status >= 500) {
      lastErr = new Error('post ' + r.status);
      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
      continue;
    }
    if (!r.ok) throw new Error('post ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return r.json();
  }
  throw lastErr || new Error('post retries exhausted');
}
async function deleteRecord(s, uri) {
  const rkey = String(uri).split('/').pop();
  const r = await fetch(BSKY + '/com.atproto.repo.deleteRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (qnfo-social)', 'Authorization': 'Bearer ' + s.accessJwt },
    body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', rkey: rkey })
  });
  if (r.status === 400) return { ok: true, already_gone: true };
  if (!r.ok) throw new Error('delete ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}
async function postThread(s, posts, threadOpts) {
  let root = null, parent = null;
  const uris = [];
  threadOpts = threadOpts || {};
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    let text = typeof p === 'string' ? p : String((p && p.text) || '');
    const reply = i > 0 ? { root: root, parent: parent } : undefined;
    const opts = { createdAt: p && p.createdAt ? p.createdAt : undefined };
    if (i === 0) {
      if (threadOpts.link) text = applyLink(text, threadOpts.link, 290);
      if (threadOpts.embed) opts.embed = threadOpts.embed;
    }
    const res = await postText(s, text, reply, opts);
    uris.push(res.uri);
    if (i === 0) root = { uri: res.uri, cid: res.cid };
    parent = { uri: res.uri, cid: res.cid };
  }
  return uris;
}
// Delete a thread's old posts then recreate them with link facets + a root embed.
async function repostThread(s, th) {
  const posts = (th.posts || []).filter(function(p){ return p && p.uri; });
  const link = String(th.link || '');
  const title = String(th.title || '');
  const desc = String(th.desc || 'QNFO research paper');
  const oldUris = posts.map(function(p){ return p.uri; });
  const deleted = [];
  for (const u of oldUris) {
    try { deleted.push(await deleteRecord(s, u)); } catch (e) { deleted.push({ uri: u, error: String(e).slice(0, 150) }); }
    await new Promise((res) => setTimeout(res, 80));
  }
  const revised = posts.map(function(p, i){
    if (i === 0) return { text: applyLink(p.text, link, 290), createdAt: p.createdAt };
    return { text: String(p.text || ''), createdAt: p.createdAt };
  });
  const embed = { title: title || 'QNFO', desc: desc };
  const uris = await postThread(s, revised, { embed: embed });
  return { deleted: deleted.length, newRoot: uris[0], count: uris.length };
}

function sanitizePosts(raw) {
  return (raw || []).map(function(x){ return truncate(String(x), 290); }).filter(function(x){ return x.trim(); });
}

function extractText(ai) {
  if (!ai) return '';
  if (typeof ai === 'string') return ai;
  if (typeof ai.response === 'string' && ai.response) return ai.response;
  var ch = (ai.choices && ai.choices[0]) || (ai.result && ai.result.choices && ai.result.choices[0]);
  if (ch) {
    if (ch.message && typeof ch.message.content === 'string' && ch.message.content) return ch.message.content;
    if (ch.message && typeof ch.message.reasoning_content === 'string' && ch.message.reasoning_content) {
      var rc = ch.message.reasoning_content;
      var m = rc.match(/\[[\s\S]*\]/);
      if (m) return m[0];
    }
    if (typeof ch.text === 'string') return ch.text;
  }
  return '';
}

// v0.5.3: structural fingerprint of an unhandled AI response, so a fail-closed escalation
// carries something diagnosable instead of an empty string (issue #676).
function describeShape(o) {
  try {
    if (o === null || o === undefined) return String(o);
    if (typeof o !== 'object') return 'type=' + typeof o;
    var keys = Object.keys(o).slice(0, 8).join(',');
    var inner = o.result || o.response;
    if (inner && typeof inner === 'object') keys += ' > ' + Object.keys(inner).slice(0, 8).join(',');
    return '{' + keys + '}';
  } catch (e) { return 'unreadable'; }
}

// Returns: [] = checked and faithful; [{post,issue},...] = problems found;
// null = CHECKER UNAVAILABLE (fail-closed - callers must NOT auto-queue).
async function checkThread(env, title, abstract, posts) {
  const base = [
    "Given a paper (title + abstract = ground truth) and a social media thread (candidate), list every claim in the thread that is NOT supported by the title or abstract.",
    "Check for: invented numbers, invented statistics, invented findings, overclaiming, misattribution, unsupported claims of being 'new' or 'first'.",
    "Ignore style: questions, hooks, calls to action, links, and generic phrases like 'read the paper'.",
    "Output ONLY a JSON array of issues, e.g. [{\"post\": 2, \"issue\": \"...\"}]. Output [] if the thread is fully faithful.",
    "PAPER: " + JSON.stringify({ title: title, abstract: abstract }),
    "THREAD: " + JSON.stringify(posts)
  ].join('\n');
  function parseIssues(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/\x60\x60\x60(?:json)?/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.filter(function(x){ return x && x.issue; });
    } catch (e) {}
    const opens = [];
    for (let i = 0; i < cleaned.length; i++) if (cleaned[i] === '[') opens.push(i);
    for (let k = 0; k < opens.length; k++) {
      const lo = opens[k];
      let depth = 0, hi = -1;
      for (let j = lo; j < cleaned.length; j++) {
        if (cleaned[j] === '[') depth++;
        else if (cleaned[j] === ']') { depth--; if (depth === 0) { hi = j; break; } }
      }
      if (hi < 0) continue;
      try {
        const parsed = JSON.parse(cleaned.slice(lo, hi + 1));
        if (Array.isArray(parsed)) return parsed.filter(function(x){ return x && x.issue; });
      } catch (e2) {}
    }
    return null;
  }
  const ai1 = await env.AI.run(CHECKER_MODEL, { messages: [{ role: 'user', content: base }], max_tokens: 2000 });
  let text = extractText(ai1).trim();
  let issues = parseIssues(text);
  let diagText = text;
  let lastAi = ai1;
  if (issues === null) {
    const ai2 = await env.AI.run(CHECKER_MODEL, { messages: [{ role: 'user', content: 'Reply with ONLY a JSON array. Nothing else.\n' + base }], max_tokens: 2000 });
    const retryText = extractText(ai2).trim();
    diagText = retryText;
    lastAi = ai2;
    issues = parseIssues(retryText);
    if (issues === null) {
      const sample = String(diagText || text || '').slice(0, 150);
      const diag = sample || ('empty model output; response shape=' + describeShape(lastAi));
      await logAlert(env, 'checker', 'warn', 'checker output unusable after retry; holding as draft (fail-closed, NOT queued): ' + diag);
      try {
        const dup = await env.DB.prepare("SELECT COUNT(*) n FROM agent_issues WHERE status='open' AND title LIKE 'SOCIAL-CHECKER-FAILOPEN%'").first();
        if (!dup || Number(dup.n) === 0) {
          const mx = await env.DB.prepare("SELECT COALESCE(MAX(id),0) m FROM agent_issues").first();
          await env.DB.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, linked_session, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))").bind(Number(mx.m) + 1, 'SOCIAL-CHECKER-FAILOPEN: fact-checker unusable after retry', 'checker empty or unparseable: ' + diag, 'qnfo-social', 'fleet-self-improve', 'medium', 'open', null).run();
        }
      } catch (eE) {}
      return null;
    }
  }
  return issues;
}

async function logAlert(env, source, level, message) {
  try {
    await env.DB.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)").bind(source, level, String(message).slice(0, 500)).run();
  } catch (e) {}
}

async function alertDigest(env) {
  try {
    const rows = await env.DB.prepare("SELECT id, source, level, message, created_at FROM alerts WHERE digested IS NULL ORDER BY id ASC LIMIT 100").all();
    const items = rows.results || [];
    if (!items.length) return;
    const summary = 'QNFO alerts digest ' + new Date().toISOString() + ' - ' + items.length + ' alert(s): ' + items.map(function(a){ return '[' + a.level + '] ' + a.source + ': ' + a.message; }).join(' | ');
    await env.DB.prepare("UPDATE alerts SET digested=1 WHERE id IN (SELECT id FROM alerts WHERE digested IS NULL ORDER BY id ASC LIMIT 100)").run();
    await logAlert(env, 'digest', 'info', 'digest emitted ' + items.length + ' alert(s)');
    console.log(summary);
  } catch (e) {
    await logAlert(env, 'digest', 'error', String(e).slice(0, 300));
  }
}

async function autoScan(env) {
  try {
    const q = 'metadata.creators.person_or_org.name:"Quni-Gudzinas"';
    const r = await fetch('https://zenodo.org/api/records?q=' + encodeURIComponent(q) + '&sort=mostrecent&size=15', {
      headers: { 'User-Agent': 'Mozilla/5.0 (qnfo-social)' }
    });
    if (!r.ok) { console.error('auto-scan zenodo fetch failed', r.status); return; }
    const d = await r.json();
    const hits = (d.hits && d.hits.hits) || [];
    const st = await env.DB.prepare("SELECT value FROM scan_state WHERE key='last_scanned'").first();
    const lastScanned = (st && st.value) || '2000-01-01T00:00:00.000000+00:00';
    let newest = lastScanned;
    let drafted = 0;
    for (const h of hits) {
      const created = h.created || '';
      if (created <= lastScanned) continue;
      const md = h.metadata || {};
      const title = String(md.title || '').slice(0, 300);
      const abstract = String(md.description || '').replace(/<[^>]+>/g, '').slice(0, 4000);
      const doi = String(h.doi || '');
      if (!title || !abstract || !doi) continue;
      const dup = await env.DB.prepare("SELECT id FROM social_threads WHERE doi=?").bind(doi).first();
      if (dup) continue;
      const prompt = [
        "Write a 5-post Bluesky thread that amplifies a research paper accurately.",
        "Rules:",
        "1. Post 1: a hook stating the core claim or a provocative question (why a reader should care).",
        "2. Post 2: the claim in plain language, faithful to the abstract (never invent or overclaim).",
        "3. Post 3: why/how it matters, in accessible terms.",
        "4. Post 4: how a reader can check it (falsifiability / open access) - invite scrutiny.",
        "5. Post 5: name the author (Rowan Brad Quni-Gudzinas) by name, give the paper link as a full URL: https://doi.org/" + doi + ", then an open discussion question.",
        "Each post under 280 characters. No exclamation marks. No marketing hype. No invented numbers.",
        "Links must be full URLs (https://...). Never write a bare DOI.",
        "Output ONLY the 5 posts, one per line, no numbering, no markdown.",
        "DOI: " + doi,
        "Title: " + title,
        "Abstract: " + abstract
      ].join(String.fromCharCode(10));
      const ai = await env.AI.run(COMPOSE_MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 2000 });
      const posts = sanitizePosts(extractText(ai).split(String.fromCharCode(10)));
      if (posts.length < 3) continue;
      const issues = await checkThread(env, title, abstract, posts);
      // v0.5.3: null (checker unavailable) is NOT clean - hold as draft.
      const status = issues && issues.length === 0 ? 'queued' : 'draft';
      const slug = 'scan-' + (doi.split('/').pop() || Date.now().toString(36));
      const notes = issues && issues.length ? JSON.stringify(issues) : (issues === null ? JSON.stringify([{ post: 0, issue: 'checker unavailable - unverified, held as draft' }]) : null);
      await env.DB.prepare("INSERT OR IGNORE INTO social_threads (slug, title, doi, posts, status, notes) VALUES (?,?,?,?,?,?)").bind(slug, title, doi, JSON.stringify(posts.slice(0, 6)), status, notes).run();
      if (!issues || issues.length) await logAlert(env, 'scan', 'warning', 'held as draft: ' + slug + ' (' + (issues === null ? 'checker unavailable' : issues.length + ' issue(s)') + ')');
      drafted++;
      if (created > newest) newest = created;
    }
    await env.DB.prepare("INSERT INTO scan_state (key, value) VALUES ('last_scanned', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(newest).run();
    console.log('auto-scan: drafted', drafted, 'draft threads; last_scanned', newest);
  } catch (e) {
    await logAlert(env, 'scan', 'error', String(e));
    console.error('auto-scan failed', String(e));
  }
}

// ---------- Buffer cross-post (GraphQL: Mastodon + LinkedIn + X) ----------
async function bufferGql(env, query) {
  const r = await fetch("https://api.buffer.com", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.BUFFER_TOKEN || ""), "User-Agent": "qnfo-social/" + VERSION },
    body: JSON.stringify({ query })
  });
  if (!r.ok) throw new Error("buffer gql " + r.status);
  return r.json();
}
async function bufferPost(env, text) {
  if (!env.BUFFER_TOKEN) return { skipped: "no BUFFER_TOKEN" };
  const results = [];
  try {
    const orgRes = await bufferGql(env, "{ account { organizations { id } } }");
    const orgs = (orgRes && orgRes.data && orgRes.data.account && orgRes.data.account.organizations) || [];
    if (!orgs.length) return { error: "no buffer org" };
    const orgId = orgs[0].id;
    const chRes = await bufferGql(env, "{ channels(input: { organizationId: \"" + orgId + "\" }) { id service isDisconnected } }");
    const channels = (chRes && chRes.data && chRes.data.channels) || [];
    for (const svc of ["mastodon", "linkedin", "twitter"]) {
      const ch = channels.find((c) => c.service === svc && !c.isDisconnected);
      if (!ch) { results.push({ platform: svc, status: "no-channel" }); continue; }
      try {
        const mutation = "mutation CreatePost { createPost(input: { text: " + JSON.stringify(text) + ", channelId: \"" + ch.id + "\", schedulingType: automatic, mode: shareNow }) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }";
        const r = await bufferGql(env, mutation);
        const cp = r && r.data && r.data.createPost;
        if (cp && cp.post) results.push({ platform: svc, status: "ok", post_id: cp.post.id });
        else results.push({ platform: svc, status: "error", error: (cp && cp.message) || JSON.stringify(r).slice(0, 120) });
      } catch (e) { results.push({ platform: svc, status: "error", error: String(e && e.message || e) }); }
    }
  } catch (e) { results.push({ status: "error", error: String(e && e.message || e) }); }
  return { results };
}

// Re-run the fact-checker on drafts held only because the checker was unavailable.
async function recheckDrafts(env) {
  var rows = await env.DB.prepare("SELECT id, slug, title, doi, posts FROM social_threads WHERE status='draft' AND notes LIKE '%checker unavailable%' ORDER BY id ASC LIMIT 6").all();
  var list = rows.results || [];
  var approved = 0, held = 0, skipped = 0;
  for (var i = 0; i < list.length; i++) {
    var row = list[i];
    var posts = [];
    try { posts = JSON.parse(row.posts); } catch (e) { posts = []; }
    if (!Array.isArray(posts) || !posts.length) { skipped++; continue; }
    var abstract = "";
    var dm = String(row.doi || "").match(/zenodo\.(\d+)/);
    if (dm) {
      try {
        var zr = await fetch("https://zenodo.org/api/records/" + dm[1], { headers: { "User-Agent": "Mozilla/5.0 (qnfo-social)" } });
        if (zr.ok) { var zj = await zr.json(); abstract = String((zj.metadata && zj.metadata.description) || "").replace(/<[^>]+>/g, "").slice(0, 4000); }
      } catch (e) { abstract = ""; }
    }
    if (!abstract) { skipped++; continue; }
    var issues = await checkThread(env, String(row.title || ""), abstract, posts);
    if (issues && issues.length === 0) {
      await env.DB.prepare("UPDATE social_threads SET status='queued', notes=NULL WHERE id=?").bind(row.id).run();
      approved++;
    } else {
      if (issues) await env.DB.prepare("UPDATE social_threads SET notes=? WHERE id=?").bind(JSON.stringify(issues), row.id).run();
      held++;
    }
  }
  if (approved) await logAlert(env, "recheck", "info", "recheck approved " + approved + " held draft(s)");
  return { checked: list.length, approved: approved, held: held, skipped: skipped };
}

var DRAIN_PER_RUN = 6;      // threads posted per scheduled run
var DRAIN_DAILY_CAP = 30;   // hard ceiling on posts per UTC day
var MAX_RETRIES = 3;        // attempts before a thread is parked as failed

// Drain the share queue oldest-first under a daily ceiling.
// WS-A3 (2026-09-26): consume the orphaned dissemination_tracker queue. 19 papers sat at
// action='queued'/channel='bluesky' since 2026-09-03 because nothing drained it (social_threads
// only carries the q08 essay threads). Post each queued paper to Bluesky, then mark it posted.
// LINK-RESOLUTION-GATE-1 (2026-09-26): never post a URL that does not resolve 200. A 301/302 is
// NOT a resolvable destination for our links (the retired q08.org essays 301 to the qnfo.org
// homepage) and a 404 is a filtered/unpublished paper (status quarantined/duplicate/kg-backfill).
async function urlResolves(url, marker) {
  try {
    const r = await fetch(url, { method: "GET", redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (qnfo-social link-gate)" } });
    if (r.status !== 200) return false;
    if (marker) {
      // LINK-RESOLUTION-GATE R4 (2026-09-26): a bare 200 is not enough - a catch-all (e.g. a list
      // page) also returns 200. Require the marker (the paper slug) to appear in the fetched body.
      const body = await r.text();
      if (body.indexOf(marker) < 0) return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}
async function httpStatus(url) {
  try {
    const r = await fetch(url, { method: "GET", redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (qnfo-social link-gate)" } });
    return r.status;
  } catch (e) {
    return 0;
  }
}
async function drainDissemination(env) {
  await env.DB.prepare("UPDATE dissemination_tracker SET action='failed', updated_at=datetime('now') WHERE action='posting' AND updated_at < datetime('now','-1 hour')").run();
  await env.DB.prepare("UPDATE dissemination_tracker SET action='queued', retry_count=COALESCE(retry_count,0)+1, updated_at=datetime('now') WHERE action='failed' AND COALESCE(retry_count,0) < 3 AND updated_at < datetime('now','-30 minutes')").run();
  const cap = await env.DB.prepare("SELECT COUNT(*) n FROM dissemination_tracker WHERE action='posted' AND posted_at >= datetime('now','start of day')").first();
  const postedToday = (cap && cap.n) || 0;
  if (postedToday >= DRAIN_DAILY_CAP) return { skipped: 'daily-cap', posted_today: postedToday };
  let posted = 0, failed = 0;
  for (let i = 0; i < DRAIN_PER_RUN; i++) {
    const row = await env.DB.prepare("SELECT * FROM dissemination_tracker WHERE action='queued' AND channel='bluesky' ORDER BY created_at ASC LIMIT 1").first();
    if (!row) break;
    try {
      await env.DB.prepare("UPDATE dissemination_tracker SET action='posting', updated_at=datetime('now') WHERE id=? AND action='queued'").bind(row.id).run();
      const link = row.pages_url || ("https://papers.qnfo.org/papers/" + String(row.paper_slug) + "/");
      if (!(await urlResolves(link, String(row.paper_slug || "").slice(0, 40)))) {
        // SUPPRESS-NON-PUBLISHED-1 (2026-09-26): a 404 means the target paper is no longer
        // published (e.g. quarantined after enqueue) -> suppress, never spam link-dead.
        const st = await httpStatus(link);
        const act = st === 404 ? "suppressed" : "link-dead";
        const note = st === 404 ? "SUPPRESSED: target paper not published (404): " : "LINK-RESOLUTION-GATE: does not resolve 200: ";
        await env.DB.prepare("UPDATE dissemination_tracker SET action=?, post_text_snippet=?, updated_at=datetime('now') WHERE id=?").bind(act, note + link, row.id).run();
        console.log("LINK_GATE dissemination " + row.id + " " + act + " " + link);
        continue;
      }
      const text = truncateSafe(String(row.paper_title || row.paper_slug) + " \u2014 " + link, 290);
      const s = await session(env);
      const r = await postText(s, text, { embed: { title: String(row.paper_title || 'QNFO'), desc: 'QNFO research \u2014 open access' } });
      await env.DB.prepare("UPDATE dissemination_tracker SET action='posted', posted_at=datetime('now'), post_url=?, post_id=?, updated_at=datetime('now') WHERE id=?").bind(r.uri, r.uri, row.id).run();
      posted++;
    } catch (e) {
      failed++;
      await env.DB.prepare("UPDATE dissemination_tracker SET action='failed', post_text_snippet=?, updated_at=datetime('now') WHERE id=?").bind(String(e).slice(0, 180), row.id).run();
    }
  }
  return { posted, failed };
}
async function drainQueue(env) {
  await env.DB.prepare(
    "UPDATE social_threads SET status = CASE WHEN retry_count < ? THEN 'queued' ELSE 'failed' END, retry_count = retry_count + 1 WHERE status = 'posting'"
  ).bind(MAX_RETRIES).run();
  await env.DB.prepare(
    "UPDATE social_threads SET status = 'queued' WHERE status = 'failed' AND retry_count < ?"
  ).bind(MAX_RETRIES).run();
  const today = await env.DB.prepare(
    "SELECT COUNT(*) n FROM social_threads WHERE status = 'posted' AND posted_at >= datetime('now','start of day')"
  ).first();
  const postedToday = (today && today.n) || 0;
  if (postedToday >= DRAIN_DAILY_CAP) return { skipped: 'daily-cap', posted_today: postedToday };
  let posted = 0, failed = 0;
  for (let i = 0; i < DRAIN_PER_RUN; i++) {
    const row = await env.DB.prepare("SELECT * FROM social_threads WHERE status='queued' ORDER BY id ASC LIMIT 1").first();
    if (!row) break;
    try {
      await env.DB.prepare("UPDATE social_threads SET status='posting' WHERE id=? AND status='queued'").bind(row.id).run();
      const posts = JSON.parse(row.posts);
      if (!Array.isArray(posts) || !posts.length) throw new Error('bad posts payload');
      const s = await session(env);
      let threadLink = null;
      for (const pt of posts) { const u = extractUrls(String(pt)); if (u.length) { threadLink = u[0]; break; } }
      if (threadLink && !(await urlResolves(threadLink))) {
        await env.DB.prepare("UPDATE social_threads SET status='link-dead', error=?, updated_at=datetime('now') WHERE id=?").bind("LINK-RESOLUTION-GATE: does not resolve 200: " + threadLink, row.id).run();
        console.log("LINK_DEAD thread " + row.id + " " + threadLink);
        continue;
      }
      const uris = await postThread(s, posts, { link: threadLink, embed: threadLink ? { title: String(row.title || 'QNFO'), desc: 'QNFO research' } : undefined });
      // Buffer (Mastodon/LinkedIn/X) posts plain text with no facet/embed support - the
      // link MUST be applied to the text itself here, mirroring what postThread() does
      // internally for Bluesky's post 1. Previously this sent the raw linkless posts[0].
      let bufferResult = null;
      try {
        const bufText = pickBufferText(posts, threadLink, row.title, 280);
        bufferResult = await bufferPost(env, bufText);
      } catch (e) { bufferResult = { error: String(e && e.message || e) }; }
      await env.DB.prepare("UPDATE social_threads SET status='posted', posted_at=datetime('now'), error=NULL WHERE id=?").bind(row.id).run();
      posted++;
      console.log('drain posted thread', row.slug, uris[0], 'buffer:', JSON.stringify(bufferResult).slice(0, 200));
    } catch (e) {
      failed++;
      await env.DB.prepare("UPDATE social_threads SET status='failed', error=?, retry_count=retry_count+1 WHERE id=?").bind(String(e).slice(0, 300), row.id).run();
      await logAlert(env, 'cron', 'error', 'drain post failed ' + row.slug + ': ' + String(e));
      console.error('drain post failed', row.slug, String(e));
    }
  }
  return { posted: posted, failed: failed, posted_today: postedToday + posted };
}

export default {
  async scheduled(event, env) {
    if (event.cron === '0 6 * * *') { await autoScan(env); return; }
    if (event.cron === '0 7 * * *') { await alertDigest(env); return; }
    await recheckDrafts(env);
    await drainQueue(env);
    await drainDissemination(env);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname, m = request.method;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Ops-Key' };
    if (m === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (p === '/health') return new Response(JSON.stringify({ ok: true, worker: 'qnfo-social', version: VERSION, handle: env.BSKY_HANDLE }), { headers: { 'Content-Type': 'application/json', ...cors } });
    if (!auth(request, env)) return new Response('unauthorized', { status: 401, headers: cors });
    try {
      if (p === '/drain-dissemination') {
        const r = await drainDissemination(env);
        return new Response(JSON.stringify({ ok: true, ...r }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/post' && m === 'POST') {
        const b = await request.json();
        const s = await session(env);
        const r = await postText(s, String(b.text || ''));
        return new Response(JSON.stringify({ ok: true, uri: r.uri }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/cross' && m === 'POST') {
        const b = await request.json();
        const link = String(b.link || '');
        const bufText = link ? applyLink(String(b.text || ''), link, 280) : truncate(String(b.text || ''), 280);
        const res = await bufferPost(env, bufText);
        return new Response(JSON.stringify({ ok: true, buffer: res, text_sent: bufText }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      // Buffer admin proxy: Buffer posts are plain text with no facet/embed model, so a bad
      // cross-post can only be REMOVED, never repaired in place. This route gives the fleet
      // read+delete control over its own Buffer history (auth-gated, same key as /repost).
      if (p === '/buffer/gql' && m === 'POST') {
        const b = await request.json();
        const q = String(b.query || '');
        if (!q) return new Response(JSON.stringify({ error: 'query required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
        const res = await bufferGql(env, q);
        return new Response(JSON.stringify({ ok: true, data: res }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/thread' && m === 'POST') {
        const b = await request.json();
        const posts = sanitizePosts(b.posts);
        if (!posts.length) return new Response(JSON.stringify({ error: 'no posts' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
        const s = await session(env);
        const uris = await postThread(s, posts);
        return new Response(JSON.stringify({ ok: true, root: uris[0], count: uris.length, uris: uris }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/threads' && m === 'GET') {
        const rows = await env.DB.prepare("SELECT id, slug, title, status, error, retry_count, posted_at, created_at FROM social_threads ORDER BY id DESC LIMIT 50").all();
        return new Response(JSON.stringify(rows.results || []), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/queue' && m === 'POST') {
        const b = await request.json();
        const posts = sanitizePosts(b.posts);
        await env.DB.prepare("INSERT OR IGNORE INTO social_threads (slug, title, posts, status) VALUES (?,?,?, 'queued')").bind(String(b.slug), String(b.title || ''), JSON.stringify(posts)).run();
        return new Response(JSON.stringify({ ok: true, slug: b.slug }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }

      if (p === '/compose' && m === 'POST') {
        const b = await request.json();
        const title = String(b.title || '').slice(0, 300);
        const abstract = String(b.abstract || '').slice(0, 4000);
        const doi = String(b.doi || '');
        if (!title || !abstract) return new Response(JSON.stringify({ error: 'title and abstract required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
        const prompt = [
          "Write a 5-post Bluesky thread that amplifies a research paper accurately.",
          "Rules:",
          "1. Post 1: a hook stating the core claim or a provocative question (why a reader should care).",
          "2. Post 2: the claim in plain language, faithful to the abstract (never invent or overclaim).",
          "3. Post 3: why/how it matters, in accessible terms.",
          "4. Post 4: how a reader can check it (falsifiability / open access) - invite scrutiny.",
          "5. Post 5: name the author (Rowan Brad Quni-Gudzinas) by name, give the paper link as a full URL: https://doi.org/" + doi + ", then an open discussion question.",
          "Each post under 280 characters. No exclamation marks. No marketing hype. No invented numbers.",
          "Links must be full URLs (https://...). Never write a bare DOI.",
          "Output ONLY the 5 posts, one per line, no numbering, no markdown.",
          "DOI: " + (doi || '(none provided)'),
          "Title: " + title,
          "Abstract: " + abstract
        ].join("\n");
        const ai = await env.AI.run(COMPOSE_MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 2000 });
        const text = extractText(ai);
        const posts = sanitizePosts(text.split("\n"));
        if (posts.length < 3) return new Response(JSON.stringify({ error: 'compose produced too few posts', raw: text.slice(0, 500) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
        const slug = String(b.slug || ('draft-' + Date.now().toString(36)));
        const issues = await checkThread(env, title, abstract, posts);
        const status = issues && issues.length === 0 ? 'queued' : 'draft';
        const notes = issues && issues.length ? JSON.stringify(issues) : (issues === null ? JSON.stringify([{ post: 0, issue: 'checker unavailable - unverified, held as draft' }]) : null);
        await env.DB.prepare("INSERT INTO social_threads (slug, title, doi, posts, status, notes) VALUES (?,?,?,?,?,?)").bind(slug, title, doi, JSON.stringify(posts.slice(0, 6)), status, notes).run();
        if (!issues || issues.length) await logAlert(env, 'compose', 'warning', 'held as draft: ' + slug + ' (' + (issues === null ? 'checker unavailable' : issues.length + ' issue(s)') + ')');
        return new Response(JSON.stringify({ ok: true, slug: slug, status: status, auto_approved: status === 'queued', checker: issues === null ? 'unavailable' : 'ok', issues: issues, posts: posts.slice(0, 6) }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/approve' && m === 'POST') {
        const b = await request.json();
        const row = await env.DB.prepare("SELECT * FROM social_threads WHERE slug=?").bind(String(b.slug)).first();
        if (!row) return new Response(JSON.stringify({ error: 'thread not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...cors } });
        await env.DB.prepare("UPDATE social_threads SET status='queued' WHERE slug=? AND status='draft'").bind(String(b.slug)).run();
        return new Response(JSON.stringify({ ok: true, slug: b.slug, status: 'queued' }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/broadcast' && m === 'POST') {
        const b = await request.json();
        const row = await env.DB.prepare("SELECT * FROM social_threads WHERE slug=?").bind(String(b.slug)).first();
        if (!row) return new Response(JSON.stringify({ error: 'thread not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...cors } });
        if (row.status === 'posted') return new Response(JSON.stringify({ error: 'already posted', status: row.status }), { status: 409, headers: { 'Content-Type': 'application/json', ...cors } });
        const posts = sanitizePosts(JSON.parse(row.posts));
        const s = await session(env);
        const uris = await postThread(s, posts);
        await env.DB.prepare("UPDATE social_threads SET status='posted', posted_at=datetime('now'), error=NULL WHERE id=?").bind(row.id).run();
        return new Response(JSON.stringify({ ok: true, root: uris[0], count: uris.length, uris: uris }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }

      if (p === '/scan' && m === 'POST') {
        await autoScan(env);
        const drafts = await env.DB.prepare("SELECT id, slug, title, doi FROM social_threads WHERE status='draft' ORDER BY id DESC LIMIT 10").all();
        return new Response(JSON.stringify({ ok: true, drafted: (drafts.results || []).length, drafts: drafts.results || [] }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/drain' && m === 'POST') {
        const res = await drainQueue(env);
        return new Response(JSON.stringify({ ok: true, drain: res }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      // Link remediation: delete old posts, recreate with facets + root embed.
      if (p === '/repost' && m === 'POST') {
        const b = await request.json();
        const threads = Array.isArray(b.threads) ? b.threads : (b.threads ? [b.threads] : []);
        if (!threads.length) return new Response(JSON.stringify({ error: 'no threads' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
        const s = await session(env);
        const results = [];
        for (const th of threads) {
          try {
            const r = await repostThread(s, th);
            results.push(r);
          } catch (e) {
            results.push({ error: String(e).slice(0, 200) });
          }
          await new Promise((res) => setTimeout(res, 120));
        }
        return new Response(JSON.stringify({ ok: true, count: results.length, results: results }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/delete' && m === 'POST') {
        const b = await request.json();
        const uris = Array.isArray(b.uris) ? b.uris : [];
        const s = await session(env);
        const out = [];
        for (const u of uris) {
          try { await deleteRecord(s, u); out.push({ uri: u, ok: true }); }
          catch (e) { out.push({ uri: u, ok: false, error: String(e).slice(0, 120) }); }
          await new Promise((res) => setTimeout(res, 60));
        }
        return new Response(JSON.stringify({ ok: true, deleted: out }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/alerts' && m === 'GET') {
        const rows = await env.DB.prepare("SELECT id, source, level, message, created_at, digested FROM alerts ORDER BY id DESC LIMIT 50").all();
        return new Response(JSON.stringify(rows.results || []), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/digest' && m === 'POST') {
        await alertDigest(env);
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      return new Response('not found', { status: 404, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
    }
  }
};

export { buildFacets, truncateSafe, applyLink, findDoi, byteLen, extractUrls };