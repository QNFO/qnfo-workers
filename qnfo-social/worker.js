// qnfo-social - cloud-based Bluesky posting (AT Protocol) + AI compose with link facets.
// v0.7.0-LINKS (2026-09-16): postText emits app.bsky.richtext.facet#link facets (UTF-8 byte offsets) for
//   every URL; root posts carry app.bsky.embed.external link cards; /repost + /delete admin routes for
//   link remediation; auth accepts X-Ops-Key (OPS_KEY secret); autoScan+compose prompts demand full
//   https:// URLs (never bare DOIs); truncateSafe never splits a URL at the 290-char boundary.
// History: v0.6.0 DRAIN-QUOTA-1 (2026-09-15) drain matched to production rate + crashed-run reclaim +
//   failed-retry sweep + daily cap. v0.5.3-checker-failclosed (2026-09-13): checker returns null (not [])
//   when unavailable -> draft. v0.5.2-checker-heal (2026-09-08): tolerant JSON parse + strict retry +
//   agent_issue escalation. FIX 2026-09-15: checker max_tokens 1000->3000 for the reasoning model.
// v0.7.19 POST-ID-UTM-1 (#1712, 2026-10-01): UTM tags on qnfo links, post ids persisted, weekly cadence cap
//   (SOCIAL_WEEKLY_CAP, default 2) and the pipeline_flags.social_paused kill switch on both drains.
// Secrets: BSKY_HANDLE, BSKY_APP_PASS, SOCIAL_TOKEN, GATEWAY_SOCIAL_TOKEN, BUFFER_TOKEN, OPS_KEY.
// Vars (optional): SOCIAL_WEEKLY_CAP. D1: DB (qnfo-audit.social_threads, dissemination_tracker, pipeline_flags). AI: env.AI.

var VERSION = "0.7.22-profile-owner-wins";
// LINKEDIN-BUFFER-DRAFTS-1 (2026-10-01, agent_issues #1713, docs/STRATEGY.md s4-s5): LinkedIn's API Terms 3.1 forbid
// automated posting, so the LinkedIn channel never receives a shareNow post. bufferPost saves it as a Buffer DRAFT
// (saveToDraft: true) that the owner approves with one tap in Buffer; Mastodon and X keep posting automatically inside
// the cadence caps. The draft id is recorded as buffer-draft:<id> in social_threads.post_uri so the daily sent-as-you
// digest (qnfo-cloud-ops) can list what is waiting for approval.
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

// POST-ID-UTM-1 (#1712, 2026-10-01): every papers.qnfo.org / qnfo.org link qnfo-social puts into a post carries
// utm_source=<channel>&utm_medium=social&utm_campaign=<slug>, so a post joins to the visits it caused (STRATEGY 6.2).
// Links to other domains (doi.org, zenodo.org, q08.org) are left untouched; a link that already has a utm_ parameter
// is never re-tagged. Without a slug the campaign is the link's last path segment (the paper slug on papers.qnfo.org).
var UTM_HOSTS = { 'qnfo.org': 1, 'www.qnfo.org': 1, 'papers.qnfo.org': 1 };
var BUFFER_UTM_SOURCE = { mastodon: 'mastodon', linkedin: 'linkedin', twitter: 'x', threads: 'threads' };
function utmTag(url, source, campaign) {
  const u = String(url || '');
  const hm = u.match(/^https?:\/\/([^\/?#:]+)/i);
  if (!hm || !UTM_HOSTS[hm[1].toLowerCase()]) return u;
  if (/[?&]utm_(source|medium|campaign)=/i.test(u)) return u;
  const hashAt = u.indexOf('#');
  const base = hashAt < 0 ? u : u.slice(0, hashAt);
  const frag = hashAt < 0 ? '' : u.slice(hashAt);
  const segs = base.replace(/^https?:\/\/[^\/?#]+/i, '').split('?')[0].split('/').filter(Boolean);
  const camp = String(campaign || segs[segs.length - 1] || 'qnfo').trim() || 'qnfo';
  const q = 'utm_source=' + encodeURIComponent(source || 'bluesky') + '&utm_medium=social&utm_campaign=' + encodeURIComponent(camp);
  const sep = base.indexOf('?') < 0 ? '?' : (/[?&]$/.test(base) ? '' : '&');
  return base + sep + q + frag;
}
function utmTagText(text, source, campaign) {
  return String(text || '').replace(/https?:\/\/[^\s"'<>()\[\]{}]+/g, function(m) {
    const core = m.replace(/[.,;:!?]+$/, '');
    return utmTag(core, source, campaign) + m.slice(core.length);
  });
}
// Fit text into max code points by shortening the PROSE, never a URL (truncateSafe drops a URL that crosses the cut,
// and a UTM tag lengthens every qnfo link). The longest prose run is cut at a word boundary and marked with an
// ellipsis, repeatedly, until the text fits. Returns null when the URLs alone do not fit.
function fitKeepUrls(text, max) {
  const s = String(text || '');
  const len = function(x) { return Array.from(x).length; };
  if (len(s) <= max) return s;
  const runs = [];
  const re = /https?:\/\/[^\s"'<>()\[\]{}]+/g;
  let last = 0, m;
  while ((m = re.exec(s)) !== null) {
    const u = m[0].replace(/[.,;:!?]+$/, '');
    runs.push({ prose: s.slice(last, m.index) });
    runs.push({ url: u });
    last = m.index + u.length;
    re.lastIndex = last;
  }
  runs.push({ prose: s.slice(last) });
  if (runs.length === 1) return truncateSafe(s, max);
  for (const r of runs) {
    if (r.url !== undefined) continue;
    r.pre = r.prose.match(/^\s*/)[0];
    const rest = r.prose.slice(r.pre.length);
    r.post = rest.match(/[\s:\u2014\u2013-]*$/)[0];
    r.body = rest.slice(0, rest.length - r.post.length);
  }
  const join = function() { return runs.map(function(r) { return r.url !== undefined ? r.url : r.pre + r.body + r.post; }).join(''); };
  for (let guard = 0; guard < 64; guard++) {
    const over = len(join()) - max;
    if (over <= 0) break;
    let best = null;
    for (const r of runs) if (r.url === undefined && r.body && (!best || len(r.body) > len(best.body))) best = r;
    if (!best) return null;
    const pts = Array.from(best.body);
    const keep = pts.length - over - 1;
    if (keep <= 0) { best.body = ''; continue; }
    let cut = pts.slice(0, keep).join('');
    const w = cut.replace(/\s+\S*$/, '');
    if (w && len(w) >= keep / 2) cut = w;
    cut = cut.replace(/[\s,;:.!?\u2014\u2013-]+$/, '');
    best.body = cut ? cut + '\u2026' : '';
  }
  const out = join().replace(/^[\s:\u2014\u2013-]+/, '').trimEnd();
  return len(out) <= max ? out : null;
}
// Tag, then fit. Fail-soft: if the tagged text cannot fit (a URL longer than the limit), post it untagged.
function tagAndFit(text, max, source, campaign) {
  const plain = String(text || '');
  try {
    const tagged = fitKeepUrls(utmTagText(plain, source, campaign), max);
    if (tagged !== null) return tagged;
  } catch (e) {}
  const fit = fitKeepUrls(plain, max);
  return fit !== null ? fit : truncateSafe(plain, max);
}
// post_uri value: the Bluesky URI alone, a lone 'buffer:<id>', or (both) a small JSON object keyed by utm_source.
function postUriValue(bskyUri, bufferResult) {
  const ids = {};
  if (bskyUri) ids.bluesky = String(bskyUri);
  const res = (bufferResult && bufferResult.results) || [];
  for (const r of res) {
    if (!r || !r.post_id) continue;
    if (r.status === 'ok') ids[BUFFER_UTM_SOURCE[r.platform] || r.platform] = 'buffer:' + r.post_id;
    else if (r.status === 'draft') ids[BUFFER_UTM_SOURCE[r.platform] || r.platform] = 'buffer-draft:' + r.post_id; // LINKEDIN-BUFFER-DRAFTS-1
  }
  const keys = Object.keys(ids);
  if (!keys.length) return null;
  return keys.length === 1 ? ids[keys[0]] : JSON.stringify(ids);
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

// PROFILE-SYNC-1 (2026-10-01): the account bio follows the owner's approved short bio (Identity doc, owner_docs
// identity, "Short bio"; owner delegation 2026-10-01). The bio read "Philosopher-scientist, AI-focused tech entrepreneur
// inventing nature-inspired quantum computers". Each run reads the public profile first and signs in only when the bio
// differs; it then rewrites only `description`, keeping displayName, avatar, banner and every other field, with
// swapRecord so a concurrent edit is never overwritten.
// PROFILE-SYNC-OWNER-WINS-1 (2026-10-01): it replaces only an empty bio or one the Identity doc lists as superseded. On
// 1 Oct, between the audit (10:17Z) and the first deploy, the bio was rewritten by hand outside the fleet; a bio the fleet
// does not recognise is the owner's edit and is left alone ({ held }) until the owner chooses.
var PROFILE_DESCRIPTION = "I build open, auditable AI-assisted research (QNFO). Asking what a correct computation costs in energy. Formerly FHWA and AARP. Some posts are drafted by my research pipeline. qnfo.org";
var PROFILE_SUPERSEDED_PREFIXES = ["Philosopher-scientist, AI-focused tech entrepreneur"];
function profileReplaceable(desc) {
  const d = String(desc || '').trim();
  return d === '' || PROFILE_SUPERSEDED_PREFIXES.some((p) => d.startsWith(p));
}
async function syncProfile(env) {
  if (!env.BSKY_HANDLE || !env.BSKY_APP_PASS) return { skipped: 'no credentials' };
  const pub = await fetch('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=' + encodeURIComponent(env.BSKY_HANDLE), { headers: { 'User-Agent': 'Mozilla/5.0 (qnfo-social)' } });
  if (pub.ok) {
    const pj = await pub.json().catch(() => null);
    if (pj && pj.description === PROFILE_DESCRIPTION) return { unchanged: true };
    if (pj && !profileReplaceable(pj.description)) return { held: 'owner-edited', current: String(pj.description || '').slice(0, 160) };
  }
  const s = await session(env);
  const H = { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (qnfo-social)', 'Authorization': 'Bearer ' + s.accessJwt };
  const g = await fetch(BSKY + '/com.atproto.repo.getRecord?repo=' + encodeURIComponent(s.did) + '&collection=app.bsky.actor.profile&rkey=self', { headers: H });
  if (!g.ok) return { error: 'getRecord ' + g.status };
  const cur = await g.json();
  const value = (cur && cur.value) || {};
  if (value.description === PROFILE_DESCRIPTION) return { unchanged: true };
  if (!profileReplaceable(value.description)) return { held: 'owner-edited', current: String(value.description || '').slice(0, 160) };
  const record = Object.assign({}, value, { $type: 'app.bsky.actor.profile', description: PROFILE_DESCRIPTION });
  const p = await fetch(BSKY + '/com.atproto.repo.putRecord', { method: 'POST', headers: H, body: JSON.stringify({ repo: s.did, collection: 'app.bsky.actor.profile', rkey: 'self', record: record, swapRecord: cur.cid }) });
  if (!p.ok) return { error: 'putRecord ' + p.status };
  return { updated: true, previous: String(value.description || '').slice(0, 160) };
}

async function postText(s, text, reply, opts) {
  opts = opts || {};
  // POST-ID-UTM-1 (#1712, 2026-10-01): tag qnfo links, then fit to 290 code points (inside Bluesky's 300 graphemes) by
  // shortening the prose, never a URL. Facets and the link card below are built from this final text.
  const record = { text: tagAndFit(text, 290, opts.utmSource || 'bluesky', opts.campaign), createdAt: (opts.createdAt || new Date().toISOString()) };
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
    const opts = { createdAt: p && p.createdAt ? p.createdAt : undefined, campaign: threadOpts.campaign };
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
  const uris = await postThread(s, revised, { embed: embed, campaign: th.slug ? String(th.slug) : undefined });
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
  const ai1 = await aiRunAttr(env, "qnfo-social", "checker", CHECKER_MODEL, { messages: [{ role: 'user', content: base }], max_tokens: 2000 });
  let text = extractText(ai1).trim();
  let issues = parseIssues(text);
  let diagText = text;
  let lastAi = ai1;
  if (issues === null) {
    const ai2 = await aiRunAttr(env, "qnfo-social", "checker-retry", CHECKER_MODEL, { messages: [{ role: 'user', content: 'Reply with ONLY a JSON array. Nothing else.\n' + base }], max_tokens: 2000 });
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
    // DISTRIBUTION-RECONCILE-1 (#1692, 2026-10-01): the scan used to read only the 15 newest records
    // past the last_scanned cursor, so a batch of publications larger than 15 (or a record indexed late)
    // was skipped for good: 3 of the 10 papers published in the 30 days to 2026-10-01 had no post on
    // any channel. It now reads 50 records and also composes for any record from the last 30 days that
    // has no thread and no posted dissemination row (at most RECONCILE_PER_RUN per run).
    const r = await fetch('https://zenodo.org/api/records?q=' + encodeURIComponent(q) + '&sort=mostrecent&size=50', {
      headers: { 'User-Agent': 'Mozilla/5.0 (qnfo-social)' }
    });
    if (!r.ok) { console.error('auto-scan zenodo fetch failed', r.status); return; }
    const d = await r.json();
    const hits = (d.hits && d.hits.hits) || [];
    const st = await env.DB.prepare("SELECT value FROM scan_state WHERE key='last_scanned'").first();
    const lastScanned = (st && st.value) || '2000-01-01T00:00:00.000000+00:00';
    let newest = lastScanned;
    let drafted = 0;
    let reconciled = 0;
    const RECONCILE_PER_RUN = 3;
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
    let pubs30 = 0;
    for (const h of hits) {
      const created = h.created || '';
      if (created >= since30) pubs30++;
      const isNew = created > lastScanned;
      if (!isNew && (created < since30 || reconciled >= RECONCILE_PER_RUN)) continue;
      const md = h.metadata || {};
      const title = String(md.title || '').slice(0, 300);
      const abstract = String(md.description || '').replace(/<[^>]+>/g, '').slice(0, 4000);
      const doi = String(h.doi || '');
      if (!title || !abstract || !doi) continue;
      const dup = await env.DB.prepare("SELECT id FROM social_threads WHERE doi=?").bind(doi).first();
      if (dup) continue;
      if (!isNew) {
        const disseminated = await env.DB.prepare("SELECT id FROM dissemination_tracker WHERE paper_doi=? AND action='posted' LIMIT 1").bind(doi).first();
        if (disseminated) continue;
        reconciled++;
      }
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
      const ai = await aiRunAttr(env, "qnfo-social", "compose", COMPOSE_MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 2000 });
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
    // Monitor: posts in the last 30 days must keep up with publications in the last 30 days.
    try {
      const pc = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM social_threads WHERE status='posted' AND posted_at >= datetime('now','-30 days')) + (SELECT COUNT(*) FROM dissemination_tracker WHERE action='posted' AND posted_at >= datetime('now','-30 days')) AS n").first();
      const posts30 = pc ? Number(pc.n || 0) : 0;
      if (posts30 < pubs30) await logAlert(env, 'scan', 'warning', 'DISTRIBUTION-RECONCILE-1: posts_30d=' + posts30 + ' < publications_30d=' + pubs30 + ' (Zenodo); distribution is not keeping up');
    } catch (e) {}
    console.log('auto-scan: drafted', drafted, '(reconciled', reconciled + ') draft threads; last_scanned', newest, 'publications_30d', pubs30);
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
// POST-ID-UTM-1 (#1712, 2026-10-01): each channel gets its own utm_source (twitter -> x). No refit after tagging:
// X and Mastodon count every link as 23 characters and LinkedIn allows 3000, so the tag does not change the length
// that the 280 cap was computed for.
async function bufferPost(env, text, campaign) {
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
        const svcText = utmTagText(text, BUFFER_UTM_SOURCE[svc] || svc, campaign);
        // LINKEDIN-BUFFER-DRAFTS-1 (#1713): LinkedIn is draft-only (owner approves in Buffer); the rest share now.
        const draft = svc === "linkedin";
        const mutation = "mutation CreatePost { createPost(input: { text: " + JSON.stringify(svcText) + ", channelId: \"" + ch.id + "\", schedulingType: automatic, mode: " + (draft ? "addToQueue, saveToDraft: true" : "shareNow") + " }) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }";
        const r = await bufferGql(env, mutation);
        const cp = r && r.data && r.data.createPost;
        if (cp && cp.post) results.push({ platform: svc, status: draft ? "draft" : "ok", post_id: cp.post.id });
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

// SOCIAL-CADENCE-CAP-1 + SOCIAL-PAUSE-1 (2026-10-01, STRATEGY 4 and 5 gates 5-6): both drains post to the owner's
// personal Bluesky account, whose cadence is 1-2 curated posts a week. Before posting, each drain reads
// pipeline_flags.social_paused ('1' = post nothing; no row = not paused) and counts Bluesky posts in the last 7 days
// (social_threads + dissemination_tracker channel 'bluesky', status posted) against env.SOCIAL_WEEKLY_CAP (default 2).
// Rows not posted stay queued: no status change, no retry_count bump. A gate read error holds the run (posts
// nothing, logs) instead of posting blind. Order: drainQueue posts a row whose flags contain 'selected' (or whose
// notes start with 'selected'; checker notes are JSON and never do) first, then oldest id first;
// dissemination_tracker has no flags/notes column, so drainDissemination stays oldest created_at first.
var SOCIAL_SCHEMA_DONE = false;
async function ensureSocialSchema(env) {
  if (SOCIAL_SCHEMA_DONE) return;
  SOCIAL_SCHEMA_DONE = true;
  try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS pipeline_flags (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)").run(); } catch (e) {}
  // POST-ID-UTM-1 (#1712): nullable post_uri; fails with 'duplicate column' once it exists, which is fine.
  try { await env.DB.prepare("ALTER TABLE social_threads ADD COLUMN post_uri TEXT").run(); } catch (e) {}
}
function weeklyCap(env) {
  const v = env && env.SOCIAL_WEEKLY_CAP;
  const n = parseInt(String(v === undefined || v === null ? '' : v), 10);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}
async function socialGate(env, who) {
  await ensureSocialSchema(env);
  const cap = weeklyCap(env);
  try {
    const f = await env.DB.prepare("SELECT value FROM pipeline_flags WHERE key='social_paused'").first();
    if (f && String(f.value).trim() === '1') {
      console.log('SOCIAL-PAUSE-1 ' + who + ': pipeline_flags.social_paused=1, posting nothing');
      return { allowed: 0, reason: 'paused', cap: cap };
    }
    const c = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM social_threads WHERE status='posted' AND posted_at >= datetime('now','-7 days')) + (SELECT COUNT(*) FROM dissemination_tracker WHERE action='posted' AND channel='bluesky' AND posted_at >= datetime('now','-7 days')) AS n").first();
    const n = Number((c && c.n) || 0);
    console.log('SOCIAL-CADENCE-CAP-1 ' + who + ': bluesky posts_7d=' + n + ' cap=' + cap + (n >= cap ? ' -> holding queued rows' : ''));
    return { allowed: Math.max(0, cap - n), reason: n >= cap ? 'weekly-cap' : null, posted_7d: n, cap: cap };
  } catch (e) {
    console.log('SOCIAL-CADENCE-CAP-1 ' + who + ': gate read failed, posting nothing this run: ' + String(e).slice(0, 120));
    return { allowed: 0, reason: 'gate-error', cap: cap };
  }
}
async function recordPostUri(env, id, value) {
  if (!value) return;
  await ensureSocialSchema(env);
  try { await env.DB.prepare("UPDATE social_threads SET post_uri=? WHERE id=?").bind(value, id).run(); }
  catch (e) { console.log('POST-ID-UTM-1 post_uri write failed for thread ' + id + ': ' + String(e).slice(0, 120)); }
}

// Drain the share queue oldest-first under a daily ceiling.
// WS-A3 (2026-09-26): consume the orphaned dissemination_tracker queue. 19 papers sat at
// action='queued'/channel='bluesky' since 2026-09-03 because nothing drained it (social_threads
// only carries the q08 essay threads). Post each queued paper to Bluesky, then mark it posted.
// LINK-RESOLUTION-GATE-1 (2026-09-26) + NEVER-RETIRE-ON-REDIRECT-1 (2026-09-27):
// A redirect (301/302/303/307/308) is a ROUTING change, NEVER a death. Destructive action -
// deleting published content or retiring a host - requires a HARD 404/410. A redirect that lands
// on a bare homepage is 'misrouted': a config bug to FIX, not content to delete. Root cause: a
// transient q08.org->qnfo.org 301 was misread as 'retirement' and 71 live posts were deleted on it.
async function probeLink(url, marker) {
  try {
    const r = await fetch(url, { method: "GET", redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (qnfo-social link-probe)" } });
    const st = r.status;
    if (st === 200) {
      if (marker) {
        // LINK-RESOLUTION-GATE R4: a bare 200 is not enough - a catch-all (e.g. a list page)
        // also returns 200. Require the marker (the paper slug) to appear in the fetched body.
        const body = await r.text();
        if (body.indexOf(marker) < 0) return { verdict: "misrouted", status: st };
      }
      return { verdict: "live", status: st };
    }
    if (st === 301 || st === 302 || st === 303 || st === 307 || st === 308) {
      return { verdict: "misrouted", status: st, final: r.headers.get("location") || "" };
    }
    if (st === 404 || st === 410) return { verdict: "gone", status: st };
    return { verdict: "transient", status: st };
  } catch (e) {
    return { verdict: "transient", status: 0, err: String(e).slice(0, 60) };
  }
}
async function urlResolves(url, marker) {
  return (await probeLink(url, marker)).verdict === "live";
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
  const gate = await socialGate(env, 'drainDissemination');
  if (!gate.allowed) return { skipped: gate.reason || 'weekly-cap', posted_7d: gate.posted_7d, cap: gate.cap };
  let posted = 0, failed = 0;
  for (let i = 0; i < DRAIN_PER_RUN && posted < gate.allowed; i++) {
    const row = await env.DB.prepare("SELECT * FROM dissemination_tracker WHERE action='queued' AND channel='bluesky' ORDER BY created_at ASC LIMIT 1").first();
    if (!row) break;
    try {
      await env.DB.prepare("UPDATE dissemination_tracker SET action='posting', updated_at=datetime('now') WHERE id=? AND action='queued'").bind(row.id).run();
      const link = row.pages_url || ("https://papers.qnfo.org/papers/" + String(row.paper_slug) + "/");
      const p = await probeLink(link, String(row.paper_slug || "").slice(0, 40));
      if (p.verdict !== "live") {
        // SUPPRESS-NON-PUBLISHED-1 + NEVER-RETIRE-ON-REDIRECT-1: 404/410 = genuinely gone ->
        // suppress. A REDIRECT is a routing change -> NEVER suppress/delete; hold as 'misrouted'.
        let act, note;
        if (p.verdict === "gone") { act = "suppressed"; note = "SUPPRESSED: target paper gone (404/410): "; }
        else if (p.verdict === "misrouted") { act = "misrouted"; note = "MISROUTED (redirect " + p.status + " -> " + String(p.final || "") + ") - NOT deleted: "; }
        else { act = "queued"; note = "TRANSIENT probe failure - retry: "; }
        if (act !== "queued") await env.DB.prepare("UPDATE dissemination_tracker SET action=?, post_text_snippet=?, updated_at=datetime('now') WHERE id=?").bind(act, note + link, row.id).run();
        console.log("LINK_GATE dissemination " + row.id + " " + act + " " + link);
        continue;
      }
      // POST-ID-UTM-1 (#1712): postText tags the link and fits by shortening the title, never the link.
      const text = String(row.paper_title || row.paper_slug) + " \u2014 " + link;
      const s = await session(env);
      const r = await postText(s, text, null, { embed: { title: String(row.paper_title || 'QNFO'), desc: 'QNFO research \u2014 open access' }, campaign: row.paper_slug ? String(row.paper_slug) : undefined });
      // post_id = the at:// URI (retractDeadLinks deletes by it); post_url = the public bsky.app permalink.
      const rkey = String(r.uri || '').split('/').pop();
      const handle = String((s && s.handle) || env.BSKY_HANDLE || '');
      const postUrl = handle && rkey ? 'https://bsky.app/profile/' + handle + '/post/' + rkey : r.uri;
      await env.DB.prepare("UPDATE dissemination_tracker SET action='posted', posted_at=datetime('now'), post_url=?, post_id=?, updated_at=datetime('now') WHERE id=?").bind(postUrl, r.uri, row.id).run();
      posted++;
    } catch (e) {
      failed++;
      await env.DB.prepare("UPDATE dissemination_tracker SET action='failed', post_text_snippet=?, updated_at=datetime('now') WHERE id=?").bind(String(e).slice(0, 180), row.id).run();
    }
  }
  return { posted, failed };
}
// RETRACT-DEAD-LINKS-1 (2026-09-26): the post-side gate stops POSTING bad links, but a paper can be
// published -> disseminated -> posted, then LATER reclassified (quarantined/duplicate/kg-backfill) by
// an out-of-band sweep, leaving a stale live post. Re-verify every posted paper link each cron and
// retract (delete the Bluesky post + flag) so the account can never carry a dead link.
async function retractDeadLinks(env) {
  const rows = await env.DB.prepare("SELECT id, post_id, pages_url FROM dissemination_tracker WHERE action='posted' AND channel='bluesky' AND post_id IS NOT NULL AND pages_url IS NOT NULL").all();
  let retracted = 0, misrouted = 0;
  for (const row of (rows.results || [])) {
    const p = await probeLink(row.pages_url);
    if (p.verdict === "live") continue;
    if (p.verdict === "gone") {
      // NEVER-RETIRE-ON-REDIRECT-1: ONLY a hard 404/410 justifies deleting published content.
      try { const s = await session(env); await deleteRecord(s, String(row.post_id)); retracted++; }
      catch (e) { console.log("RETRACT del fail " + row.id + " " + String(e && e.message || e).slice(0, 80)); }
      await env.DB.prepare("UPDATE dissemination_tracker SET action='link-dead', post_text_snippet='RETRACTED: 404/410 gone', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
    } else if (p.verdict === "misrouted") {
      // A redirect is NOT a death - flag for repair, never delete.
      misrouted++;
      await env.DB.prepare("UPDATE dissemination_tracker SET post_text_snippet=?, updated_at=datetime('now') WHERE id=?").bind("MISROUTED (redirect " + p.status + " -> " + String(p.final || "") + ") - NOT deleted; fix the route", row.id).run();
    }
    // transient -> leave alone, retry next cron
  }
  if (retracted) console.log("RETRACTED " + retracted + " genuinely-gone paper posts");
  return { retracted, misrouted };
}
// RESTORE-MISDELETED-1 (2026-09-27, ADD-VALUE): if a thread was flagged link-dead/misrouted but its
// link NOW resolves 200 (e.g. a route was fixed), re-queue it automatically. Self-healing recovery
// from the exact failure that deleted 71 q08 essays on a transient redirect.
async function restoreMisdeleted(env) {
  const rows = await env.DB.prepare("SELECT id, slug, posts FROM social_threads WHERE status IN ('link-dead','misrouted')").all();
  let restored = 0;
  for (const row of (rows.results || [])) {
    let link = null;
    try { const arr = JSON.parse(row.posts || "[]"); for (const t of arr) { const u = extractUrls(String(t)); if (u.length) { link = u[0]; break; } } } catch (e) {}
    if (!link) continue;
    if (await urlResolves(link)) {
      await env.DB.prepare("UPDATE social_threads SET status='queued', error=NULL, updated_at=datetime('now') WHERE id=?").bind(row.id).run();
      restored++;
    }
  }
  if (restored) console.log("RESTORED " + restored + " mis-deleted threads (link now resolves)");
  return { restored };
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
  const gate = await socialGate(env, 'drainQueue');
  if (!gate.allowed) return { skipped: gate.reason || 'weekly-cap', posted_7d: gate.posted_7d, cap: gate.cap, posted_today: postedToday };
  let posted = 0, failed = 0;
  for (let i = 0; i < DRAIN_PER_RUN && posted < gate.allowed; i++) {
    const row = await env.DB.prepare("SELECT * FROM social_threads WHERE status='queued' ORDER BY CASE WHEN COALESCE(flags,'') LIKE '%selected%' OR COALESCE(notes,'') LIKE 'selected%' THEN 0 ELSE 1 END, id ASC LIMIT 1").first();
    if (!row) break;
    try {
      await env.DB.prepare("UPDATE social_threads SET status='posting' WHERE id=? AND status='queued'").bind(row.id).run();
      const posts = JSON.parse(row.posts);
      if (!Array.isArray(posts) || !posts.length) throw new Error('bad posts payload');
      const s = await session(env);
      let threadLink = null;
      for (const pt of posts) { const u = extractUrls(String(pt)); if (u.length) { threadLink = u[0]; break; } }
      if (threadLink) {
        const p = await probeLink(threadLink);
        if (p.verdict === "gone") {
          await env.DB.prepare("UPDATE social_threads SET status='link-dead', error=?, updated_at=datetime('now') WHERE id=?").bind("LINK-GONE (404/410): " + threadLink, row.id).run();
          console.log("LINK_GONE thread " + row.id + " " + threadLink);
          continue;
        }
        if (p.verdict === "misrouted") {
          // NEVER-RETIRE-ON-REDIRECT-1: hold + flag (fix the route, then reset to queued). Do NOT delete.
          await env.DB.prepare("UPDATE social_threads SET status='misrouted', error=?, updated_at=datetime('now') WHERE id=?").bind("MISROUTED (redirect " + p.status + " -> " + String(p.final || "") + ") - NOT deleted", row.id).run();
          console.log("LINK_MISROUTED thread " + row.id + " " + threadLink);
          continue;
        }
        if (p.verdict === "transient") { continue; }
      }
      const uris = await postThread(s, posts, { link: threadLink, embed: threadLink ? { title: String(row.title || 'QNFO'), desc: 'QNFO research' } : undefined, campaign: row.slug ? String(row.slug) : undefined });
      // Buffer (Mastodon/LinkedIn/X) posts plain text with no facet/embed support - the
      // link MUST be applied to the text itself here, mirroring what postThread() does
      // internally for Bluesky's post 1. Previously this sent the raw linkless posts[0].
      let bufferResult = null;
      try {
        const bufText = pickBufferText(posts, threadLink, row.title, 280);
        bufferResult = await bufferPost(env, bufText, row.slug ? String(row.slug) : undefined);
      } catch (e) { bufferResult = { error: String(e && e.message || e) }; }
      await env.DB.prepare("UPDATE social_threads SET status='posted', posted_at=datetime('now'), error=NULL WHERE id=?").bind(row.id).run();
      posted++;
      // POST-ID-UTM-1 (#1712): a separate, fail-soft write, so a missing column can never re-queue a posted row.
      await recordPostUri(env, row.id, postUriValue(uris[0], bufferResult));
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
    try {
      const ps = await syncProfile(env);
      if (ps && (ps.updated || ps.error || ps.held)) console.log('[qnfo-social] profile-sync', JSON.stringify(ps));
    } catch (e) { console.log('[qnfo-social] profile-sync threw', String(e && e.message || e).slice(0, 200)); }
    await recheckDrafts(env);
    await drainQueue(env);
    await drainDissemination(env);
    await retractDeadLinks(env);
    await restoreMisdeleted(env);
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
        const res = await bufferPost(env, bufText, b.slug ? String(b.slug) : undefined);
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
        const ai = await aiRunAttr(env, "qnfo-social", "compose-2", COMPOSE_MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 2000 });
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
        const uris = await postThread(s, posts, { campaign: row.slug ? String(row.slug) : undefined });
        await env.DB.prepare("UPDATE social_threads SET status='posted', posted_at=datetime('now'), error=NULL WHERE id=?").bind(row.id).run();
        await recordPostUri(env, row.id, postUriValue(uris[0], null));
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

// WORKERS-AI-SPEND-UNATTRIBUTED-RISING-1 (#1681): every env.AI.run in this worker goes through aiRunAttr, which adds a
// per-worker/purpose call counter to D1 ai_call_counters (one UPSERT per call, fail-soft, never blocks or alters the AI call).
// Copied from qnfo-fleet-control (workers cannot import across directories); same table/columns. No new paid service.
// Unlike fleet-control the counter write is NOT awaited (fire-and-forget, errors swallowed) so it can never add latency.
var AI_ATTR_DB_BINDINGS = ["DB"];
async function aiRunAttr(env, worker, purpose, model, input, opts) {
  var t0 = Date.now(), ok = 1;
  try { return await env.AI.run(model, input, opts); } catch (e) { ok = 0; throw e; }
  finally {
    try {
      var db = null;
      for (var bi = 0; bi < AI_ATTR_DB_BINDINGS.length && !db; bi++) db = env[AI_ATTR_DB_BINDINGS[bi]];
      if (db) {
        var ic = 0; try { ic = JSON.stringify(input && input.messages || input || "").length; } catch (e2) {}
        var day = new Date().toISOString().slice(0, 10);
        var ms = Date.now() - t0;
        var wr = (async function() {
          await db.prepare("CREATE TABLE IF NOT EXISTS ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model))").run();
          await db.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors, in_chars, ms) VALUES (?1,?2,?3,?4,1,?5,?6,?7) ON CONFLICT(day, worker, purpose, model) DO UPDATE SET calls=calls+1, errors=errors+?5, in_chars=in_chars+?6, ms=ms+?7").bind(day, worker, purpose, String(model), ok ? 0 : 1, ic, ms).run();
        })();
        wr.catch(function() {});
      }
    } catch (e3) {}
  }
}
// end aiRunAttr
export { buildFacets, truncateSafe, applyLink, findDoi, byteLen, extractUrls, utmTag, utmTagText, fitKeepUrls, tagAndFit, postUriValue, weeklyCap, socialGate, drainQueue, drainDissemination, syncProfile, PROFILE_DESCRIPTION };