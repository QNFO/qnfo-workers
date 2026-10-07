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
// v0.7.35 SOCIAL-POST-TRUNCATION-1 (#1902, pillar: reach): postText fits the UNTAGGED text and puts the UTM only in each link
//   facet uri (tagFacets), so tracking costs no visible characters and the prose is never cut for it; stored_text keeps the tagged form.
// Secrets: BSKY_HANDLE, BSKY_APP_PASS, SOCIAL_TOKEN, GATEWAY_SOCIAL_TOKEN, BUFFER_TOKEN, OPS_KEY.
// Vars (optional): SOCIAL_WEEKLY_CAP. D1: DB (qnfo-audit.social_threads, dissemination_tracker, pipeline_flags; 0.7.28 also
// social_learner_posts, ops_config social_learner_enabled / social_learner_pending, metric_registry). AI: env.AI.

var VERSION = "0.9.0-promote-route"; // 0.9.0 PROMOTE-ROUTE-1 (2026-10-07, pillar reach, owner directive "no siloes"): the channel drain takes queued research papers from dissemination_tracker (newest first, after curated queued threads, before recycled posted threads), so a published paper reaches LinkedIn, Mastodon and X while Bluesky is at attention share 0. // 0.8.2 UTM-VISITS-1 (2026-10-06, pillar reach, transformation lever T7.9 half 2): learnerVisits reads the gateway's tagged loads first (reach_signals source utm, metric clicks_human, campaign = the paper slug, channel = the utm_source of the post's channel; UTM-CLICK-LEDGER-1, qnfo-gateway 3.10.0 + qnfo-fleet-dashboard 1.26.0, PR 688): a direct count of the visits a post caused beats the bot-filtered RUM lift, which stays the fallback when the window carries no tagged row. 0.8.1 LEARNER-CHANNEL-ARM-1 was
// 0.8.1 (2026-10-06, LEARNER-CHANNEL-ARM-1, transformation lever T7.13, pillar reach; owner directive "execute the suggestions"): the
// distribution learner gains a channel arm (bluesky, linkedin, mastodon, x): Buffer channel posts become learner rows credited
// from the reach ledger's buffer metrics, the posterior carries a channel allocation, and the channel drain visits the Buffer
// channels in the order of one Beta draw each (learnerChannelOrder); GET /learner shows the channel dimension.
// 0.8.0 (2026-10-06, ATTENTION-SHARE-1, pillar reach; owner directive 2026-10-06 07:44Z): the actuation half of qnfo-fleet-dashboard
// ATTENTION-LOOP-1. ops_config attention_channel_share (per-channel share of the owner cap, written daily by the dashboard's
// scorecard from human attention per item) scales the Buffer channel caps and the Bluesky cap (never above them; a stale
// share reads as 1); the channel drain orders posted rows noticed-first (bot-filtered external loads of the paper plus the
// post's Bluesky engagement); the distribution learner credits closed 72h windows daily (learnerDailyCredit) instead of
// only in the weekly update, and reads the bot-filtered per-item rows for visits when present.
// 0.7.37 (2026-10-06, DAILY-DISTRIBUTION-1, pillar: reach; owner directive 2026-10-06 "persistent, routine, daily" outreach):
// LinkedIn, Mastodon and X (connected in Buffer) posted only as the cross-post of a Bluesky post, so the Bluesky cap (2 a
// week) was every channel's cap and nothing went out on 5 of 7 days. Each Buffer channel now has its own weekly cap inside
// STRATEGY s4 (LinkedIn 3, Mastodon 2, X 2; pipeline_flags.social_channel_caps overrides, 0..7), evenly spaced over the
// week, filled by a channel drain on the 2-hourly tick after the Bluesky drains (queued selected rows first, then posted
// rows the channel has not carried in 30 days), with the subscribe offer on LinkedIn; ledger social_media_posts and
// social-channels-<day>; bufferPost skips a channel that already carried the slug. No cap is raised; Bluesky is unchanged.
// 0.7.36 (2026-10-05, REACH-REPAIR-1, pillar: reach): a draft the checker held was a dead end (4 eligible pillar 1-3
// papers on 2026-10-05, one since 09-29). Now each held draft gets exactly one automatic rewrite with the checker's
// findings fed back, then a fresh check: clean -> queued; held again -> rejected with both rounds of findings in notes.
// 0.7.34 (2026-10-03, owner directive "wire an ideation loop so the fleet generates and queues the next reach work itself,
// without asking", pillar: reach): REACH-SELECT-1 + REACH-REFILL-1. Measured before: the Zenodo scan composed a thread for
// every new paper (10 on 2026-10-03 06:0xZ, nearly all ultrametric programme, which STRATEGY 2.3 keeps out of outreach),
// spending AI on posts that must never ship, while 7 of 11 drafts were held only because the checker treated the author's
// name (which the composer is told to write) as invented. Now: (1) the scan, the recheck and the drain apply the STRATEGY
// 2.3/2.4 selection (reachEligible); an ineligible paper is recorded as suppressed with its reason, at no AI cost;
// (2) the checker's ground truth includes the author and the link; (3) when fewer than REFILL_MIN_QUEUE threads are
// queued, the daily scan composes one thread for the STRATEGY 2.4 selected work with the most Zenodo views that has had no
// thread in REFILL_GAP_DAYS days, so the queue never runs dry and only refills with work the strategy leads with.
// 0.7.31 (2026-10-02, #1712 POST-ID-UTM-1, pillar: reach): POST-SENT-TEXT-1 + POST-UTM-SUBDOMAIN-1. The UTM tag was
// applied at send time only and social_threads.posts kept the untagged draft, so D1 had no record that any posted link
// carried a UTM and the issue's probe could never pass. A posted row now stores the text exactly as posted (tagged and
// fitted) in social_threads.posts, and a dissemination post stores it in dissemination_tracker.post_text_snippet; the
// /post, /thread, /cross and /broadcast routes record the same. Every *.qnfo.org host is tagged (was qnfo.org, www and
// papers only, so the ipatent.qnfo.org launch post would have gone out untagged).
// 0.7.29 (2026-10-02): GET /learner names an unavailable part ("posterior unavailable") and never echoes exception text
// (CodeQL js/stack-trace-exposure); the detail goes to the worker log.
// 0.7.28 (2026-10-02, pillar: reach): SOCIAL-DISTRIBUTION-LEARNER-1 (STRATEGY 6.4 "distribution allocation (weekly)",
// owner directive 2026-10-02: measure external effectiveness and change itself to improve it). A Thompson-sampling bandit
// over topic x format x time slot chooses which queued post goes next and in which slot, inside the weekly cap, pause flag
// and content gates; it never adds a post. Rewards (72h Bluesky engagement plus attributed paper-page views) are credited
// once per post in a weekly update; ops_config social_learner_enabled=0 restores the 0.7.27 order and timing. Daily
// metric_registry social_engagement_rate_30d; public GET /learner. Full design at the SOCIAL-DISTRIBUTION-LEARNER-1 block.
// 0.7.27 (2026-10-02, pillar: reach): SOCIAL-RUN-LEDGER-1. The profile sync, the posting drain with its Buffer cross-post,
// the Zenodo scan and the engagement collector each record their run in cloud_ops_events (social-<op>-<day>), so the
// watchmaker (qnfo-fleet-dashboard WATCHMAKER_OPS) can tell a quiet run from a dead one. The two drains no longer share a
// try: a throw in one ended the tick before the other drain and the link checks ran.
// 0.7.25 (2026-10-01, #1713): LINKEDIN-OWNER-DELEGATED-1 and BUFFER-CHANNEL-AUDIT-1. The owner directed (2026-10-01 21:35Z,
// in addition to OWNER-DELEGATION-SOCIAL-1) that LinkedIn be managed without any manual step. LinkedIn is connected in
// Buffer (engagement run 2026-09-20: channels linkedin, twitter, mastodon). The fleet never calls LinkedIn's API; Buffer,
// the account holder's authorised publishing app, publishes from its queue. pipeline_flags.linkedin_mode selects
// 'publish' (Buffer queue, default per the owner's direction) or 'draft' (one-tap approval); the weekly cap, pause flag
// and content gate apply unchanged. A daily channel audit records every Buffer channel in social_channels.
// 0.7.21 (2026-10-01, #1712 POST-ID-UTM-1, #1647 SOCIAL-ENGAGEMENT-COLLECTION-STOPPED-1, #1713): measured at 14:11 UTC,
// social_threads had 141 posted rows and 0 with post_uri. Every one of them was posted before 0.7.19 went live
// (first deploy 11:22 UTC; newest post 04:30 UTC), and since then the queue was empty and the weekly cap (96 Bluesky
// posts in 7 days against 2) held everything, so the 0.7.19 code had never run on a real post. Hardened here:
// markPosted writes status and post_uri in one statement; the HTTP publish routes pass the pause flag, the cap and the
// content gate and record a row with post_uri; OWNER-VOICE-CONTENT-GATE-1 repairs mojibake and refuses q08.org links;
// SOCIAL-ENGAGEMENT-SELF-1 collects per-post Bluesky engagement daily for every recorded post id.
// LINKEDIN-BUFFER-DRAFTS-1 (2026-10-01, agent_issues #1713, docs/STRATEGY.md s4-s5): LinkedIn's API Terms 3.1 forbid
// automated posting, so the LinkedIn channel never receives a shareNow post. bufferPost saves it as a Buffer DRAFT
// (saveToDraft: true) that the owner approves with one tap in Buffer; Mastodon and X keep posting automatically inside
// the cadence caps. The draft id is recorded as buffer-draft:<id> in social_threads.post_uri so the daily sent-as-you
// digest (qnfo-cloud-ops) can list what is waiting for approval.
// Superseded 2026-10-01 by LINKEDIN-OWNER-DELEGATED-1 (0.7.25): draft is now the opt-in mode (pipeline_flags.linkedin_mode='draft').
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
// POST-UTM-SUBDOMAIN-1 (0.7.31, #1712): every qnfo.org host is the owner's own site, so every one is tagged. The list
// was qnfo.org, www and papers only, so the 2026-10-02 launch post for https://ipatent.qnfo.org/example (social_threads
// 153) would have gone out untagged and could never be joined to the visits it caused.
function utmHost(host) {
  const h = String(host || '').toLowerCase();
  return h === 'qnfo.org' || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.qnfo\.org$/.test(h);
}
var BUFFER_UTM_SOURCE = { mastodon: 'mastodon', linkedin: 'linkedin', twitter: 'x', threads: 'threads' };
function utmTag(url, source, campaign) {
  const u = String(url || '');
  const hm = u.match(/^https?:\/\/([^\/?#:]+)/i);
  if (!hm || !utmHost(hm[1])) return u;
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
// SOCIAL-POST-TRUNCATION-1 (0.7.35, agent_issues #1902): the visible post text is fitted WITHOUT the UTM parameters (about 55
// characters per qnfo link), and the tracking rides only in each link facet's uri. Before this, tagAndFit lengthened every
// qnfo link and then fitKeepUrls cut the prose to make room, so the 2026-10-02 launch post went out ending "Status: open…".
// A facet whose host is not a qnfo host keeps its uri (utmTag leaves other hosts and already-tagged links alone).
function tagFacets(facets, source, campaign) {
  return (facets || []).map(function(f) {
    return Object.assign({}, f, { features: (f.features || []).map(function(ft) {
      return ft && ft.$type === 'app.bsky.richtext.facet#link' ? Object.assign({}, ft, { uri: utmTag(ft.uri, source, campaign) }) : ft;
    }) });
  });
}
// post_uri value: the Bluesky URI alone, a lone 'buffer:<id>', or (both) a small JSON object keyed by utm_source.
function postUriValue(bskyUri, bufferResult) {
  const ids = {};
  if (bskyUri) ids.bluesky = String(bskyUri);
  const res = (bufferResult && bufferResult.results) || [];
  for (const r of res) {
    if (!r || !r.post_id) continue;
    if (r.status === 'ok' || r.status === 'queued') ids[BUFFER_UTM_SOURCE[r.platform] || r.platform] = 'buffer:' + r.post_id;
    else if (r.status === 'draft') ids[BUFFER_UTM_SOURCE[r.platform] || r.platform] = 'buffer-draft:' + r.post_id; // LINKEDIN-BUFFER-DRAFTS-1
  }
  const keys = Object.keys(ids);
  if (!keys.length) return null;
  return keys.length === 1 ? ids[keys[0]] : JSON.stringify(ids);
}

// OWNER-VOICE-CONTENT-GATE-1 (0.7.21, STRATEGY s4 + s5 gate 3): nothing leaves qnfo-social for the owner's channels with
// a q08.org link (q08 was removed from Bluesky) or with mojibake. UTF-8 text that was decoded as Latin-1/cp1252 upstream
// (e.g. an em dash stored as U+00E2 U+0080 U+0094, posted live on 2026-10-01) is repaired back to the real character;
// text that still carries a mojibake sequence after repair is held, never posted.
var CP1252_BYTE = { '\u20ac': 0x80, '\u201a': 0x82, '\u0192': 0x83, '\u201e': 0x84, '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87,
  '\u02c6': 0x88, '\u2030': 0x89, '\u0160': 0x8a, '\u2039': 0x8b, '\u0152': 0x8c, '\u017d': 0x8e, '\u2018': 0x91, '\u2019': 0x92,
  '\u201c': 0x93, '\u201d': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97, '\u02dc': 0x98, '\u2122': 0x99, '\u0161': 0x9a,
  '\u203a': 0x9b, '\u0153': 0x9c, '\u017e': 0x9e, '\u0178': 0x9f };
var MOJI_CONT = '[\\u0080-\\u00bf' + Object.keys(CP1252_BYTE).join('') + ']';
var MOJI_SEQ_RE = new RegExp('[\\u00c2-\\u00df]' + MOJI_CONT + '|[\\u00e0-\\u00ef]' + MOJI_CONT + '{2}|[\\u00f0-\\u00f4]' + MOJI_CONT + '{3}', 'g');
var MOJIBAKE_LEFT_RE = /\u00c3[\u0080-\u00bf]|\u00e2\u0080|\u00e2\u20ac|\u00c2[\u0080-\u00bf]|\ufffd/;
var Q08_LINK_RE = /(?:^|[^a-z0-9.-])(?:[a-z0-9-]+\.)*q08\.org(?!\.?[a-z0-9-])/i;
function repairMojibake(text) {
  const s = String(text || '');
  let dec = null;
  try { dec = new TextDecoder('utf-8', { fatal: true }); } catch (e) { return s; }
  return s.replace(MOJI_SEQ_RE, function(m) {
    const bytes = [];
    for (const ch of m) {
      const c = ch.charCodeAt(0);
      const b = c <= 0xff ? c : CP1252_BYTE[ch];
      if (b === undefined) return m;
      bytes.push(b);
    }
    try { return dec.decode(new Uint8Array(bytes)); } catch (e) { return m; }
  });
}
function contentGate(texts) {
  const out = (texts || []).map(function(t) { return repairMojibake(typeof t === 'string' ? t : String((t && t.text) || '')); });
  for (const t of out) {
    if (Q08_LINK_RE.test(t)) return { ok: false, reason: 'q08-link', texts: out };
    if (MOJIBAKE_LEFT_RE.test(t)) return { ok: false, reason: 'mojibake', texts: out };
  }
  return { ok: true, texts: out };
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
// OWNER-DELEGATION-SOCIAL-1 (2026-10-01): the owner directed "automatically manage all my social media accounts ... I will not
// provide any manual action or intervention", which decides human_actions bluesky-bio-choice by delegation: the bio
// hand-edited earlier that day is superseded by the approved systems-first short bio (its text is kept in the
// resolution). A bio edited later and not listed here is still left alone.
var PROFILE_SUPERSEDED_PREFIXES = ["Philosopher-scientist, AI-focused tech entrepreneur", "Founder of QNFO: independent open-science research on quantum computing architectures"];
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
  // SOCIAL-POST-TRUNCATION-1 (0.7.35): fit the untagged text, then put the UTM on the facet uri only (see tagFacets).
  const plainText = String(text || '');
  let shown = fitKeepUrls(plainText, 290);
  if (shown === null) shown = truncateSafe(plainText, 290);
  const record = { text: shown, createdAt: (opts.createdAt || new Date().toISOString()) };
  if (reply) record.reply = reply;
  const facets = tagFacets(buildFacets(record.text), opts.utmSource || 'bluesky', opts.campaign);
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
    // POST-SENT-TEXT-1 (0.7.31, #1712): hand back the text exactly as posted (tagged and fitted), so the caller can store
    // it. Before this the tagged text lived only on Bluesky and D1 kept the untagged draft, so no probe could see a UTM.
    const out = await r.json();
    if (out && typeof out === 'object') {
      out.text = record.text;
      // The copy kept in D1 (POST-SENT-TEXT-1) shows the link as the facet resolves it, so a probe on social_threads.posts
      // LIKE '%utm_source=%' still sees the tag; the public post itself shows the short link.
      out.stored_text = utmTagText(record.text, opts.utmSource || 'bluesky', opts.campaign);
      out.link_uris = facets.map(function(f) { return f.features[0] && f.features[0].uri; }).filter(Boolean); // tagged targets of the visible links
    }
    return out;
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
    // POST-SENT-TEXT-1: a caller that passes threadOpts.sent = [] gets the posted texts, in order.
    if (Array.isArray(threadOpts.sent)) threadOpts.sent.push(typeof res.stored_text === 'string' ? res.stored_text : (typeof res.text === 'string' ? res.text : text));
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
async function checkThread(env, title, abstract, posts, doi) {
  const base = [
    "Given a paper (title + abstract = ground truth) and a social media thread (candidate), list every claim in the thread that is NOT supported by the title or abstract.",
    "Check for: invented numbers, invented statistics, invented findings, overclaiming, misattribution, unsupported claims of being 'new' or 'first'.",
    "Ignore style: questions, hooks, calls to action, links, and generic phrases like 'read the paper'.",
    "The author's name and the paper link in PAPER are ground truth: naming the author or giving the link is never an issue.",
    "Output ONLY a JSON array of issues, e.g. [{\"post\": 2, \"issue\": \"...\"}]. Output [] if the thread is fully faithful.",
    "PAPER: " + JSON.stringify({ title: title, author: SOCIAL_AUTHOR, link: doi ? "https://doi.org/" + doi : "", abstract: abstract }),
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


// ---- REACH-SELECT-1:BEGIN (0.7.34) ----
// STRATEGY 2.4 selected works: the only papers outreach and headlines lead with. Keep in step with docs/STRATEGY.md 2.4
// (reach-select.test.mjs reads the DOIs from that table and fails CI when they differ).
var REACH_SELECTED = [
  { n: 1, doi: "10.5281/zenodo.21637028" }, { n: 2, doi: "10.5281/zenodo.22261547" }, { n: 3, doi: "10.5281/zenodo.21821767" },
  { n: 4, doi: "10.5281/zenodo.21945415" }, { n: 5, doi: "10.5281/zenodo.21901984" }, { n: 6, doi: "10.5281/zenodo.22026592" },
  { n: 7, doi: "10.5281/zenodo.23079905" }
];
// STRATEGY 2.3: pillars 1-3 lead; pillar 4 (ultrametric programme) and speculative unification stay out of outreach until a
// falsifiable test result exists. Deny wins over allow. Title signals only (plus a few unambiguous abstract terms), so an
// abstract that merely says "unified framework" does not suppress an energy paper.
var REACH_DENY_TITLE = /\b(ultrametric|p-adic|adelic|adeles?|braid\w*|temperley|holograph\w*|ads\/cft|fine-structure|cross-ratio|modular data|radix|unif(y|ying|ied|ication)|theory of everything|general theory|self-proving|reification|ontolog\w*|consciousness|cosmolog\w*|qwav|diameter|scaling exponents?|hierarchical structure)\b/i;
var REACH_DENY_ABSTRACT = /\b(ultrametric|p-adic|adelic|ads\/cft)\b/i;
var REACH_ALLOW_TITLE = /\b(joules?|energy|energetic|thermodynamic\w*|landauer|jpcub|power|watts?|carbon|efficien\w*|epistemic\w*|ignorance|legib\w*|ai-assisted|metascience|reproducib\w*|validity|autonomous|fleet|agentic|agents?|research operations|llms?|inference)\b/i;
var SOCIAL_AUTHOR = "Rowan Brad Quni-Gudzinas";
function reachSelected(doi) {
  var d = String(doi || "").toLowerCase();
  for (var i = 0; i < REACH_SELECTED.length; i++) if (REACH_SELECTED[i].doi === d) return REACH_SELECTED[i];
  return null;
}
function reachDenied(title, abstract) {
  var m = REACH_DENY_TITLE.exec(String(title || "")) || REACH_DENY_ABSTRACT.exec(String(abstract || ""));
  return m ? m[0].toLowerCase() : "";
}
// Pure: may the fleet spend AI composing, and post, a thread about this paper without asking?
function reachEligible(title, abstract, doi) {
  var sel = reachSelected(doi);
  if (sel) return { ok: true, reason: "STRATEGY 2.4 selected work " + sel.n };
  var d = reachDenied(title, abstract);
  if (d) return { ok: false, reason: "STRATEGY 2.3: pillar 4 / speculative theory ('" + d + "') stays out of outreach" };
  var a = REACH_ALLOW_TITLE.exec(String(title || ""));
  if (a) return { ok: true, reason: "STRATEGY 2.3 pillars 1-3 ('" + a[0].toLowerCase() + "')" };
  return { ok: false, reason: "STRATEGY 2.3: no pillar 1-3 signal in the title" };
}
// One composer prompt for the scan, /compose and the refill (it used to be copied twice).
function composePrompt(doi, title, abstract) {
  return [
    "Write a 5-post Bluesky thread that amplifies a research paper accurately.",
    "Rules:",
    "1. Post 1: a hook stating the core claim or a provocative question (why a reader should care).",
    "2. Post 2: the claim in plain language, faithful to the abstract (never invent or overclaim).",
    "3. Post 3: why/how it matters, in accessible terms.",
    "4. Post 4: how a reader can check it (falsifiability / open access) - invite scrutiny.",
    "5. Post 5: name the author (" + SOCIAL_AUTHOR + ") by name, give the paper link as a full URL: https://doi.org/" + doi + ", then an open discussion question.",
    "Each post under 280 characters. No exclamation marks. No marketing hype. No invented numbers.",
    "Never call the paper new, first, novel or recent: the abstract is the only source.",
    "Links must be full URLs (https://...). Never write a bare DOI.",
    "Output ONLY the 5 posts, one per line, no numbering, no markdown.",
    "DOI: " + (doi || "(none provided)"),
    "Title: " + title,
    "Abstract: " + abstract
  ].join(String.fromCharCode(10));
}
// Pure: which selected work to refill next. recent = {doi: 1} with a thread in the gap window; views = {doi: n}.
// Most Zenodo views first (demand), then the STRATEGY order.
function pickRefill(recent, views) {
  var c = REACH_SELECTED.filter(function(w) { return !recent[w.doi]; });
  c.sort(function(a, b) { return (Number(views[b.doi]) || 0) - (Number(views[a.doi]) || 0) || a.n - b.n; });
  return c[0] || null;
}
var REFILL_MIN_QUEUE = 2;   // at the 2/week cap, fewer than 2 queued is less than a week of supply
var REFILL_GAP_DAYS = 30;   // STRATEGY 5 gate 5: duplicate check against the last 30 days
async function zenodoRecord(doi) {
  var m = String(doi || "").match(/zenodo\.(\d+)/);
  if (!m) return null;
  var r = await fetch("https://zenodo.org/api/records/" + m[1], { headers: { "User-Agent": "Mozilla/5.0 (qnfo-social)" } });
  if (!r.ok) return null;
  var j = await r.json();
  var md = j.metadata || {};
  var title = String(md.title || "").slice(0, 300), abstract = String(md.description || "").replace(/<[^>]+>/g, "").slice(0, 4000);
  return title && abstract ? { id: m[1], title: title, abstract: abstract } : null;
}
// REACH-REFILL-1: keep at least REFILL_MIN_QUEUE threads queued, from the selected works only. One compose + one check
// per run at most; a thread the checker holds stays a draft (and blocks that work for REFILL_GAP_DAYS), so a bad work
// cannot loop.
async function reachRefill(env, nowMs) {
  var now = nowMs || Date.now();
  var q = await env.DB.prepare("SELECT COUNT(*) n FROM social_threads WHERE status='queued'").first();
  var depth = Number(q && q.n || 0);
  if (depth >= REFILL_MIN_QUEUE) return { queued: depth, refilled: 0, reason: "queue holds " + depth };
  var since = new Date(now - REFILL_GAP_DAYS * 864e5).toISOString().replace("T", " ").slice(0, 19);
  var rr = await env.DB.prepare("SELECT doi FROM social_threads WHERE doi IS NOT NULL AND status IN ('queued','posting','posted','draft') AND COALESCE(posted_at, created_at) >= ?").bind(since).all();
  var recent = {};
  ((rr && rr.results) || []).forEach(function(r) { recent[String(r.doi).toLowerCase()] = 1; });
  var views = {};
  try {
    var vr = await env.DB.prepare("SELECT doi, views FROM zenodo_stats WHERE doi IN (" + REACH_SELECTED.map(function() { return "?"; }).join(",") + ")").bind(...REACH_SELECTED.map(function(w) { return w.doi; })).all();
    ((vr && vr.results) || []).forEach(function(r) { views[String(r.doi).toLowerCase()] = Number(r.views) || 0; });
  } catch (e) {}
  var pick = pickRefill(recent, views);
  if (!pick) return { queued: depth, refilled: 0, reason: "every selected work has a thread in the last " + REFILL_GAP_DAYS + " days" };
  var rec = await zenodoRecord(pick.doi);
  if (!rec) return { queued: depth, refilled: 0, reason: "zenodo record unavailable for " + pick.doi };
  var ai = await aiRunAttr(env, "qnfo-social", "refill", COMPOSE_MODEL, { messages: [{ role: "user", content: composePrompt(pick.doi, rec.title, rec.abstract) }], max_tokens: 2000 });
  var posts = sanitizePosts(extractText(ai).split(String.fromCharCode(10)));
  if (posts.length < 3) return { queued: depth, refilled: 0, reason: "compose produced too few posts", work: pick.n };
  var issues = await checkThread(env, rec.title, rec.abstract, posts, pick.doi);
  var status = issues && issues.length === 0 ? "queued" : "draft";
  var slug = "refill-" + rec.id + "-" + new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  var notes = status === "queued" ? "selected: REACH-REFILL-1 STRATEGY 2.4 work " + pick.n + " (queue had " + depth + ")"
    : JSON.stringify(issues === null ? [{ post: 0, issue: "checker unavailable - unverified, held as draft" }] : issues);
  await env.DB.prepare("INSERT OR IGNORE INTO social_threads (slug, title, doi, posts, status, notes, flags) VALUES (?,?,?,?,?,?,?)")
    .bind(slug, rec.title, pick.doi, JSON.stringify(posts.slice(0, 6)), status, notes, status === "queued" ? "selected" : null).run();
  if (status !== "queued") await logAlert(env, "refill", "warning", "held as draft: " + slug + " (" + (issues === null ? "checker unavailable" : issues.length + " issue(s)") + ")");
  return { queued: depth + (status === "queued" ? 1 : 0), refilled: 1, slug: slug, status: status, work: pick.n };
}
// Drafts about papers STRATEGY keeps out of outreach are suppressed with the reason, so no recheck or approval can post them.
async function reachSweepDrafts(env) {
  var rows = await env.DB.prepare("SELECT id, title, doi, notes FROM social_threads WHERE status='draft' AND doi IS NOT NULL AND doi <> ''").all();
  var n = 0;
  for (var i = 0, list = (rows && rows.results) || []; i < list.length; i++) {
    var el = reachEligible(list[i].title, "", list[i].doi);
    if (el.ok) continue;
    await env.DB.prepare("UPDATE social_threads SET status='suppressed', notes=?, updated_at=datetime('now') WHERE id=? AND status='draft'")
      .bind(("REACH-SELECT-1: " + el.reason + " | was: " + String(list[i].notes || "")).slice(0, 1000), list[i].id).run();
    n++;
  }
  return n;
}
// REACH-REPAIR-1 (0.7.35): one rewrite per held draft, findings fed back; terminal state either way.
var REPAIR_PER_RUN = 2;
function repairPrompt(doi, title, abstract, posts, issues) {
  return composePrompt(doi, title, abstract) + String.fromCharCode(10) +
    "A fact checker rejected the previous draft for these reasons; write a new thread that avoids every one of them and adds nothing the abstract does not state:" + String.fromCharCode(10) +
    (issues || []).map(function(x) { return "- post " + x.post + ": " + String(x.issue || "").slice(0, 300); }).join(String.fromCharCode(10)) + String.fromCharCode(10) +
    "Previous draft (do not reuse its rejected wording): " + JSON.stringify(posts || []).slice(0, 2000);
}
async function reachRepairDrafts(env) {
  var rows = await env.DB.prepare("SELECT id, title, doi, posts, notes FROM social_threads WHERE status='draft' AND doi IS NOT NULL AND doi <> '' AND notes LIKE '[%' ORDER BY id ASC LIMIT ?").bind(REPAIR_PER_RUN).all();
  var out = { tried: 0, queued: 0, rejected: 0, skipped: 0 };
  for (var i = 0, list = (rows && rows.results) || []; i < list.length; i++) {
    var row = list[i], issues = [], posts = [];
    try { issues = JSON.parse(row.notes); } catch (e) { issues = []; }
    try { posts = JSON.parse(row.posts); } catch (e) { posts = []; }
    if (!reachEligible(row.title, "", row.doi).ok) { out.skipped++; continue; } // the sweep suppresses these
    var rec = await zenodoRecord(row.doi);
    if (!rec) { out.skipped++; continue; }
    out.tried++;
    var ai = await aiRunAttr(env, "qnfo-social", "repair", COMPOSE_MODEL, { messages: [{ role: "user", content: repairPrompt(row.doi, rec.title, rec.abstract, posts, issues) }], max_tokens: 2000 });
    var np = sanitizePosts(extractText(ai).split(String.fromCharCode(10)));
    var again = np.length >= 3 ? await checkThread(env, rec.title, rec.abstract, np, row.doi) : [{ post: 0, issue: "rewrite produced too few posts" }];
    if (again && again.length === 0) {
      var sel = reachSelected(row.doi);
      await env.DB.prepare("UPDATE social_threads SET status='queued', posts=?, notes=?, flags=?, updated_at=datetime('now') WHERE id=? AND status='draft'")
        .bind(JSON.stringify(np.slice(0, 6)), (sel ? "selected: " : "") + "REACH-REPAIR-1: rewritten after checker findings, now clean | first round: " + String(row.notes).slice(0, 600), sel ? "selected" : null, row.id).run();
      out.queued++;
    } else {
      await env.DB.prepare("UPDATE social_threads SET status='rejected', notes=?, updated_at=datetime('now') WHERE id=? AND status='draft'")
        .bind(("REACH-REPAIR-1: held twice, not posted | first: " + String(row.notes).slice(0, 450) + " | second: " + JSON.stringify(again === null ? [{ issue: "checker unavailable" }] : again)).slice(0, 1000), row.id).run();
      out.rejected++;
    }
  }
  return out;
}
// ---- REACH-SELECT-1:END ----
async function autoScan(env) {
  try {
    const q = 'metadata.creators.person_or_org.name:"Quni-Gudzinas"';
    // DISTRIBUTION-RECONCILE-1 (#1692, 2026-10-01): the scan used to read only the 15 newest records
    // past the last_scanned cursor, so a batch of publications larger than 15 (or a record indexed late)
    // was skipped for good: 3 of the 10 papers published in the 30 days to 2026-10-01 had no post on
    // any channel. It now reads 25 records and also composes for any record from the last 30 days that
    // has no thread and no posted dissemination row (at most RECONCILE_PER_RUN per run).
    // size=25: Zenodo's anonymous API rejects size>25 with 400 (SOCIAL-SCAN-PAGESIZE-1).
    const r = await fetch('https://zenodo.org/api/records?q=' + encodeURIComponent(q) + '&sort=mostrecent&size=25', {
      headers: { 'User-Agent': 'Mozilla/5.0 (qnfo-social)' }
    });
    if (!r.ok) { console.error('auto-scan zenodo fetch failed', r.status); return { error: 'zenodo ' + r.status }; }
    const d = await r.json();
    const hits = (d.hits && d.hits.hits) || [];
    const st = await env.DB.prepare("SELECT value FROM scan_state WHERE key='last_scanned'").first();
    const lastScanned = (st && st.value) || '2000-01-01T00:00:00.000000+00:00';
    let newest = lastScanned;
    let drafted = 0;
    let suppressed = 0;
    let reconciled = 0;
    const RECONCILE_PER_RUN = 3;
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
    let pubs30 = 0;
    for (const h of hits) {
      const created = h.created || '';
      const md = h.metadata || {};
      const title = String(md.title || '').slice(0, 300);
      const abstract = String(md.description || '').replace(/<[^>]+>/g, '').slice(0, 4000);
      const doi = String(h.doi || '');
      // REACH-SELECT-1: only papers STRATEGY 2.3/2.4 leads with count toward "distribution keeps up" and get a compose.
      const el = reachEligible(title, abstract, doi);
      if (created >= since30 && el.ok) pubs30++;
      const isNew = created > lastScanned;
      if (!isNew && (created < since30 || reconciled >= RECONCILE_PER_RUN)) continue;
      if (!title || !abstract || !doi) continue;
      const dup = await env.DB.prepare("SELECT id FROM social_threads WHERE doi=?").bind(doi).first();
      if (dup) continue;
      if (!el.ok) {
        await env.DB.prepare("INSERT OR IGNORE INTO social_threads (slug, title, doi, posts, status, notes) VALUES (?,?,?,?,?,?)").bind('scan-' + (doi.split('/').pop() || Date.now().toString(36)), title, doi, '[]', 'suppressed', 'REACH-SELECT-1: ' + el.reason).run();
        suppressed++;
        if (created > newest) newest = created;
        continue;
      }
      if (!isNew) {
        const disseminated = await env.DB.prepare("SELECT id FROM dissemination_tracker WHERE paper_doi=? AND action='posted' LIMIT 1").bind(doi).first();
        if (disseminated) continue;
        reconciled++;
      }
      const prompt = composePrompt(doi, title, abstract);
      const ai = await aiRunAttr(env, "qnfo-social", "compose", COMPOSE_MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 2000 });
      const posts = sanitizePosts(extractText(ai).split(String.fromCharCode(10)));
      if (posts.length < 3) continue;
      const issues = await checkThread(env, title, abstract, posts, doi);
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
    let swept = 0, refill = null;
    try { swept = await reachSweepDrafts(env); } catch (e) { await logAlert(env, 'scan', 'error', 'REACH-SELECT-1 sweep: ' + String(e).slice(0, 200)); }
    let repair = null;
    try { repair = await reachRepairDrafts(env); } catch (e) { repair = { error: String(e && e.message || e).slice(0, 200) }; await logAlert(env, 'repair', 'error', repair.error); }
    try { refill = await reachRefill(env); } catch (e) { refill = { error: String(e && e.message || e).slice(0, 200) }; await logAlert(env, 'refill', 'error', refill.error); }
    // Monitor: posts in the last 30 days must keep up with publications in the last 30 days.
    try {
      const pc = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM social_threads WHERE status='posted' AND posted_at >= datetime('now','-30 days')) + (SELECT COUNT(*) FROM dissemination_tracker WHERE action='posted' AND posted_at >= datetime('now','-30 days')) AS n").first();
      const posts30 = pc ? Number(pc.n || 0) : 0;
      if (posts30 < pubs30) await logAlert(env, 'scan', 'warning', 'DISTRIBUTION-RECONCILE-1: posts_30d=' + posts30 + ' < publications_30d=' + pubs30 + ' (Zenodo); distribution is not keeping up');
    } catch (e) {}
    console.log('auto-scan: drafted', drafted, '(reconciled', reconciled + ') draft threads; suppressed', suppressed, 'swept', swept, 'refill', JSON.stringify(refill), 'last_scanned', newest, 'eligible_publications_30d', pubs30);
    return { records: hits.length, drafted: drafted, suppressed: suppressed, swept: swept, repair: repair, refill: refill, reconciled: reconciled, publications_30d: pubs30, last_scanned: newest };
  } catch (e) {
    await logAlert(env, 'scan', 'error', String(e));
    console.error('auto-scan failed', String(e));
    return { error: String(e && e.message || e).slice(0, 200) };
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
// DAILY-DISTRIBUTION-1 (0.7.37): the Buffer organisation and channel list, read once per call site.
async function bufferChannels(env) {
  const orgRes = await bufferGql(env, "{ account { organizations { id } } }");
  const orgs = (orgRes && orgRes.data && orgRes.data.account && orgRes.data.account.organizations) || [];
  if (!orgs.length) return { error: "no buffer org", channels: [] };
  const chRes = await bufferGql(env, "{ channels(input: { organizationId: \"" + orgs[0].id + "\" }) { id service isDisconnected } }");
  return { orgId: orgs[0].id, channels: (chRes && chRes.data && chRes.data.channels) || [] };
}
// One Buffer post on one channel. `text` is already tagged for that channel. LinkedIn goes to the queue (or a draft in
// pipeline_flags.linkedin_mode='draft'); Mastodon and X share now. The result shape is what postUriValue reads.
async function bufferCreate(env, ch, svc, svcText, liMode) {
  try {
    // LINKEDIN-BUFFER-DRAFTS-1 (#1713): LinkedIn is draft-only (owner approves in Buffer); the rest share now.
    const draft = svc === "linkedin" && liMode === "draft";
    const queued = svc === "linkedin" && !draft;
    const mutation = "mutation CreatePost { createPost(input: { text: " + JSON.stringify(svcText) + ", channelId: \"" + ch.id + "\", schedulingType: automatic, mode: " + (draft ? "addToQueue, saveToDraft: true" : queued ? "addToQueue" : "shareNow") + " }) { ... on PostActionSuccess { post { id status } } ... on MutationError { message } } }";
    const r = await bufferGql(env, mutation);
    const cp = r && r.data && r.data.createPost;
    // 0.7.21: read back the status Buffer gave the LinkedIn post; anything but 'draft' is an alert (ToS 3.1).
    if (cp && cp.post && draft && cp.post.status && String(cp.post.status).toLowerCase() !== "draft") {
      await logAlert(env, "linkedin-draft", "error", "LINKEDIN-BUFFER-DRAFTS-1: Buffer post " + cp.post.id + " came back with status " + cp.post.status + ", not draft");
      return { platform: svc, status: "error", post_id: cp.post.id, error: "not-draft:" + cp.post.status };
    }
    if (cp && cp.post) return { platform: svc, status: draft ? "draft" : queued ? "queued" : "ok", post_id: cp.post.id, text: svcText };
    return { platform: svc, status: "error", error: (cp && cp.message) || JSON.stringify(r).slice(0, 120) };
  } catch (e) { return { platform: svc, status: "error", error: String(e && e.message || e) }; }
}
async function bufferPost(env, text, campaign) {
  if (!env.BUFFER_TOKEN) return { skipped: "no BUFFER_TOKEN" };
  const results = [];
  try {
    const bc = await bufferChannels(env);
    if (bc.error) return { error: bc.error };
    const channels = bc.channels;
    const liMode = await linkedinMode(env);
    for (const svc of ["mastodon", "linkedin", "twitter"]) {
      const ch = channels.find((c) => c.service === svc && !c.isDisconnected);
      if (!ch) { results.push({ platform: svc, status: "no-channel" }); continue; }
      // DAILY-DISTRIBUTION-1: a channel that already carried this slug (its own daily drain, or an earlier cross-post) in the
      // last CHANNEL_REPEAT_DAYS is skipped, so the Bluesky cross-post never duplicates a channel post.
      if (campaign && await channelCarried(env, svc, campaign)) { results.push({ platform: svc, status: "skipped", reason: "carried-" + CHANNEL_REPEAT_DAYS + "d" }); continue; }
      const svcText = utmTagText(text, BUFFER_UTM_SOURCE[svc] || svc, campaign);
      const res = await bufferCreate(env, ch, svc, svcText, liMode);
      results.push(res);
      if (res.post_id && res.status !== "error") await recordChannelPost(env, svc, campaign, res, svcText, "cross-post");
    }
  } catch (e) { results.push({ status: "error", error: String(e && e.message || e) }); }
  return { results };
}

// ---------- DAILY-DISTRIBUTION-1 (0.7.37, 2026-10-06, pillar: reach; STRATEGY s4 cadence per channel) ----------
// Owner directive 2026-10-06: outreach must be persistent, routine and daily. Measured before this change (qnfo-audit,
// 2026-10-06): LinkedIn, Mastodon and X, all connected in Buffer (social_channels), received a post only as the cross-post
// of a Bluesky post, and the Bluesky weekly cap (2) held both drains, so every channel carried 2 items in the week of
// 10-02 (social_threads 152 and 154), nothing went out on 5 of 7 days, and four launch-queue rows (149, 150, 151, 153)
// waited the whole week. STRATEGY s4 gives each channel its own cadence: LinkedIn 2-3 a week, Mastodon a mirror of
// Bluesky (1-2), X at most 2. Nothing here raises a cap. Each Buffer channel gets its own weekly cap inside those numbers
// (CHANNEL_WEEKLY_CAP; pipeline_flags.social_channel_caps, a JSON object, overrides it, clamped to 0..7), its posts are
// spread over the week (minimum spacing 7 days / cap, so LinkedIn posts about every 56h and the mirrors every 84h), a
// channel never carries the same slug twice in CHANNEL_REPEAT_DAYS, and with Bluesky's own 2 a week the fleet publishes
// on most days of the week while every channel stays inside its STRATEGY cadence. The drain runs on the same 2-hourly
// tick as the Bluesky drains, after them, so a Bluesky post and its cross-posts come first and this drain fills only the
// room a channel still has. Content: the oldest queued selected row first (the launch queue reaches LinkedIn before
// Bluesky's cap lets it out), else the most recently posted row since the cadence epoch the channel has not carried.
// LinkedIn gets the whole thread (up to CHANNEL_MAX_CHARS.linkedin) with a one-line subscribe offer (lever 1 of
// agent_issues 1753: carry the subscribe offer in distribution posts); Mastodon and X get the 280-character fit. Every
// row still passes contentGate, the REACH-SELECT-1 deny rule and the link probe; pipeline_flags.social_paused holds
// everything; a posted row's status is never changed here. Ledger: social_media_posts (platform buffer-<channel>,
// project_id = slug, buffer_id, published_at; the table distribution_posts_30d already counts) and one cloud_ops_events
// row per day (social-channels-<day>), which the watchmaker reads.
var CHANNEL_WEEKLY_CAP = { linkedin: 3, mastodon: 2, twitter: 2 };
var CHANNEL_PLATFORM = { linkedin: 'buffer-linkedin', mastodon: 'buffer-mastodon', twitter: 'buffer-x' };
var CHANNEL_MAX_CHARS = { linkedin: 1300, mastodon: 280, twitter: 280 };
var CHANNEL_REPEAT_DAYS = 30;
var CHANNEL_ORDER = ['linkedin', 'mastodon', 'twitter'];
var SUBSCRIBE_LINE = 'Research notes by email, monthly at most: https://qnfo.org/';
async function channelCaps(env) {
  const caps = Object.assign({}, CHANNEL_WEEKLY_CAP);
  try {
    const f = await env.DB.prepare("SELECT value FROM pipeline_flags WHERE key='social_channel_caps'").first();
    const o = f && f.value ? JSON.parse(String(f.value)) : null;
    if (o && typeof o === 'object') for (const k of CHANNEL_ORDER) { const n = parseInt(String(o[k]), 10); if (Number.isFinite(n)) caps[k] = Math.max(0, Math.min(7, n)); }
  } catch (e) {}
  return caps;
}
// ---------- ATTENTION-SHARE-1 (0.8.0, 2026-10-06, pillar reach; the actuation half of qnfo-fleet-dashboard ATTENTION-LOOP-1) ----------
// Owner directive 2026-10-06 07:44Z: do more of what gets noticed; promote better or stop what is not. The dashboard's daily
// scorecard grades every channel's human attention per item and writes ops_config attention_channel_share, a share in
// [0, 1] per channel (bluesky, linkedin, mastodon, x). Here the share multiplies the owner's weekly cap (STRATEGY s4 and
// pipeline_flags.social_channel_caps for the Buffer channels, SOCIAL_WEEKLY_CAP for Bluesky): share 1 is the cap, 0.5 half
// of it, 0.25 one post a week at most (the re-test week), 0 holds every post (STOP). A share never raises a cap. A share
// row older than 3 days (the scorecard stopped) reads as 1 for every channel, so a dead loop can never silence a channel.
var ATTENTION_SHARE_STALE_MS = 3 * 864e5;
async function attentionShares(env) {
  const out = { bluesky: 1, linkedin: 1, mastodon: 1, twitter: 1, day: null, source: 'default' };
  try {
    const r = await env.DB.prepare("SELECT value, updated_at FROM ops_config WHERE key='attention_channel_share'").first();
    const o = r && r.value ? JSON.parse(String(r.value)) : null;
    if (!o || typeof o !== 'object') return out;
    const ts = String(r.updated_at || '').trim();
    const age = ts ? Date.now() - Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(ts) ? ts : ts.replace(' ', 'T') + 'Z') : NaN;
    if (!(age <= ATTENTION_SHARE_STALE_MS)) { out.source = 'stale-default'; out.stale_day = o.day || null; return out; }
    for (const k of ['bluesky', 'linkedin', 'mastodon']) { const v = Number(o[k]); if (Number.isFinite(v)) out[k] = Math.max(0, Math.min(1, v)); }
    const x = Number(o.x); if (Number.isFinite(x)) out.twitter = Math.max(0, Math.min(1, x));
    out.day = o.day || null; out.source = 'ops_config';
  } catch (e) {}
  return out;
}
// Pure: the effective weekly cap. A positive share keeps at least one slot (a re-test needs one post), share 0 is 0.
function shareCap(cap, share) {
  const c = Number(cap) || 0, s = Number.isFinite(Number(share)) ? Math.max(0, Math.min(1, Number(share))) : 1;
  if (c <= 0 || s <= 0) return 0;
  return Math.max(1, Math.floor(c * s));
}
// Pure-ish: posted rows go noticed-first (the paper's bot-filtered external loads over 28 days plus the Bluesky engagement
// of the thread's own post, from reach_signals); queued selected rows keep their place ahead. A failed read keeps the
// incoming order.
async function attentionOrder(env, rows) {
  const posted = rows.filter(function(r) { return r.status === 'posted'; }), queued = rows.filter(function(r) { return r.status !== 'posted'; });
  if (posted.length < 2) return rows;
  try {
    const slugs = {}, uris = {};
    for (const r of posted) { const s = learnerLinkSlug(r.posts); if (s) slugs[s] = 1; const u = blueskyUriOf(r.post_uri); if (u) uris[u] = 1; }
    const sl = Object.keys(slugs), ur = Object.keys(uris), ext = {}, eng = {};
    if (sl.length) {
      const q = await env.DB.prepare("SELECT entity_id, SUM(value) AS v FROM reach_signals WHERE source = 'cf-rum-human' AND entity_type = 'paper' AND metric = 'external_pageviews' AND date >= date('now', '-28 days') AND entity_id IN (" + sl.map(function() { return '?'; }).join(',') + ") GROUP BY entity_id").bind(...sl).all();
      for (const x of (q && q.results) || []) ext[x.entity_id] = Number(x.v) || 0;
    }
    if (ur.length) {
      const q = await env.DB.prepare("SELECT entity_id, metric, MAX(value) AS v FROM reach_signals WHERE source = 'bluesky' AND entity_type = 'post' AND metric IN ('likes', 'reposts', 'quotes') AND entity_id IN (" + ur.map(function() { return '?'; }).join(',') + ") GROUP BY entity_id, metric").bind(...ur).all();
      for (const x of (q && q.results) || []) eng[x.entity_id] = (eng[x.entity_id] || 0) + (Number(x.v) || 0);
    }
    const of = function(r) { const s = learnerLinkSlug(r.posts), u = blueskyUriOf(r.post_uri); return (s ? ext[s] || 0 : 0) + (u ? eng[u] || 0 : 0); };
    const scored = posted.map(function(r, i) { return { r: r, i: i, a: of(r) }; }).sort(function(a, b) { return b.a - a.a || a.i - b.i; });
    for (const x of scored) x.r.attention = x.a;
    return queued.concat(scored.map(function(x) { return x.r; }));
  } catch (e) { return rows; }
}
async function capEpoch(env) {
  try { const ef = await env.DB.prepare("SELECT value FROM pipeline_flags WHERE key='social_cap_epoch'").first(); if (ef && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(ef.value || '').trim())) return String(ef.value).trim(); } catch (e) {}
  return '0';
}
async function ensureChannelSchema(env) {
  try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_media_posts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT, url TEXT, content_preview TEXT, published_at TEXT, buffer_id TEXT, project_id TEXT, paper_doi TEXT, status TEXT DEFAULT 'published', engagement_metrics TEXT, created_at TEXT DEFAULT (datetime('now')), _version INTEGER DEFAULT 1)").run(); } catch (e) {}
}
// Posts a channel carried in the last 7 days (from the cadence epoch) and when it last posted: its own ledger rows plus the
// cross-posts recorded in social_threads.post_uri (a JSON object keyed by utm_source: linkedin, mastodon, x).
async function channelWindow(env, channel, epoch) {
  const key = BUFFER_UTM_SOURCE[channel] || channel;
  const a = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(published_at) AS last FROM social_media_posts WHERE platform=?1 AND status='published' AND published_at >= MAX(datetime('now','-7 days'), ?2)").bind(CHANNEL_PLATFORM[channel], epoch).first();
  const b = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(posted_at) AS last FROM social_threads WHERE status='posted' AND post_uri LIKE ?1 AND posted_at >= MAX(datetime('now','-7 days'), ?2)").bind('%"' + key + '":"buffer%', epoch).first();
  const n = Number((a && a.n) || 0) + Number((b && b.n) || 0);
  const lasts = [a && a.last, b && b.last].filter(Boolean).map(function(x) { return Date.parse(String(x).replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(String(x)) ? '' : 'Z')); }).filter(function(t) { return Number.isFinite(t); });
  return { n: n, lastMs: lasts.length ? Math.max.apply(null, lasts) : null };
}
async function channelCarried(env, channel, slug) {
  if (!slug) return false;
  const key = BUFFER_UTM_SOURCE[channel] || channel;
  try {
    const a = await env.DB.prepare("SELECT 1 AS x FROM social_media_posts WHERE platform=?1 AND project_id=?2 AND status='published' AND published_at >= datetime('now', ?3) LIMIT 1").bind(CHANNEL_PLATFORM[channel], String(slug), '-' + CHANNEL_REPEAT_DAYS + ' days').first();
    if (a) return true;
    const b = await env.DB.prepare("SELECT 1 AS x FROM social_threads WHERE slug=?1 AND status='posted' AND post_uri LIKE ?2 AND posted_at >= datetime('now', ?3) LIMIT 1").bind(String(slug), '%"' + key + '":"buffer%', '-' + CHANNEL_REPEAT_DAYS + ' days').first();
    return !!b;
  } catch (e) { return true; }   // an unreadable ledger holds the post (never duplicate blind)
}
async function recordChannelPost(env, channel, slug, res, text, via) {
  await ensureChannelSchema(env);
  const id = 'ch-' + (BUFFER_UTM_SOURCE[channel] || channel) + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try {
    await env.DB.prepare("INSERT INTO social_media_posts (id, platform, post_id, url, content_preview, published_at, buffer_id, project_id, status, engagement_metrics) VALUES (?1,?2,?3,NULL,?4,datetime('now'),?3,?5,'published',?6)")
      .bind(id, CHANNEL_PLATFORM[channel], String(res.post_id), String(text || '').slice(0, 200), slug ? String(slug) : null, JSON.stringify({ via: via, buffer_status: res.status })).run();
  } catch (e) { console.log('DAILY-DISTRIBUTION-1 ledger write failed for ' + channel + ' ' + slug + ': ' + String(e && e.message || e).slice(0, 120)); }
  return id;
}
// The text one channel receives: LinkedIn the whole thread (link applied, subscribe offer appended), the short channels the
// same 280-character pick the Bluesky cross-post uses. Pure; tagging happens at send time (utmTagText per channel).
function channelText(channel, posts, link, title) {
  const max = CHANNEL_MAX_CHARS[channel] || 280;
  if (channel !== 'linkedin') return pickBufferText(posts, link, title, max);
  const list = (posts || []).map(function(p) { return typeof p === 'string' ? p : String((p && p.text) || ''); }).map(function(t) { return t.trim(); }).filter(Boolean);
  let body = list.join('\n\n');
  if (link && body.indexOf(link) < 0) body = applyLink(body, link, max - 60);
  const fitted = fitKeepUrls(body, max - SUBSCRIBE_LINE.length - 2);
  const base = fitted !== null ? fitted : truncateSafe(body, max - SUBSCRIBE_LINE.length - 2);
  return base + '\n\n' + SUBSCRIBE_LINE;
}
// Candidate rows for a channel: queued selected rows oldest first, then rows posted since the cadence epoch newest first;
// q08 essays and anything the channel carried in CHANNEL_REPEAT_DAYS are skipped (the caller applies the content gates).
async function pickChannelRow(env, channel, epoch) {
  const rows = (await env.DB.prepare("SELECT id, slug, title, posts, status, doi, notes, flags, posted_at, post_uri FROM social_threads WHERE (status='queued' AND (COALESCE(flags,'') LIKE '%selected%' OR COALESCE(notes,'') LIKE 'selected%')) OR (status='posted' AND posted_at >= ?1 AND posted_at >= datetime('now','-60 days')) ORDER BY CASE WHEN status='queued' THEN 0 ELSE 1 END, CASE WHEN status='queued' THEN id ELSE 0 END ASC, posted_at DESC LIMIT 24").bind(epoch === '0' ? '2026-10-01 00:00:00' : epoch).all()).results || [];
  // ATTENTION-SHARE-1: noticed items first among the posted rows.
  const ordered = await attentionOrder(env, rows);
  // PROMOTE-ROUTE-1 (0.9.0): new research papers reach the Buffer channels. qnfo-research-exec queues every published
  // paper in dissemination_tracker for Bluesky only, and the channel drain read social_threads only, so with Bluesky at
  // attention share 0 (STOP since 2026-10-06) the 28 papers published 2026-09-30..10-06 reached no channel at all. Order:
  // queued curated threads first, then the newest queued paper not yet carried on this channel, then recycled posted threads.
  let paperTried = false;
  for (const row of ordered) {
    if (row.status !== 'queued' && !paperTried) {
      paperTried = true;
      const pr = await pickPaperRow(env, channel);
      if (pr) return pr;
    }
    if (!row.slug || /^q08-/.test(String(row.slug))) continue;
    if (await channelCarried(env, channel, row.slug)) continue;
    return row;
  }
  return paperTried ? null : await pickPaperRow(env, channel);
}
// PROMOTE-ROUTE-1: a queued dissemination row (a paper the research pipeline published in the last PAPER_PROMOTE_DAYS)
// as a channel-drain candidate, shaped like a social_threads row: one post, title and papers.qnfo.org link. The tracker
// row stays queued for Bluesky; channelCarried keeps one post per paper per channel.
var PAPER_PROMOTE_DAYS = 30;
async function pickPaperRow(env, channel) {
  let rows = [];
  try { rows = (await env.DB.prepare("SELECT id, paper_slug, paper_title, paper_doi, pages_url FROM dissemination_tracker WHERE action='queued' AND channel='bluesky' AND paper_slug IS NOT NULL AND paper_slug <> '' AND created_at >= datetime('now', ?1) ORDER BY created_at DESC LIMIT 20").bind('-' + PAPER_PROMOTE_DAYS + ' days').all()).results || []; } catch (e) { return null; }
  for (const d of rows) {
    const slug = String(d.paper_slug);
    if (/^q08-/.test(slug)) continue;
    if (await channelCarried(env, channel, slug)) continue;
    const link = d.pages_url || ('https://papers.qnfo.org/papers/' + slug + '/');
    const title = repairMojibake(String(d.paper_title || slug));
    return { id: 'dissem:' + d.id, slug: slug, title: title, posts: JSON.stringify([title + ' \u2014 new open-access paper: ' + link]), status: 'paper', doi: d.paper_doi || null, notes: 'paper:dissemination_tracker', flags: '', posted_at: null, post_uri: null };
  }
  return null;
}
async function drainChannels(env, opts) {
  opts = opts || {};
  const nowMs = opts.nowMs || Date.now();
  const out = { posted: 0, channels: {} };
  if (!env.BUFFER_TOKEN) return { skipped: 'no BUFFER_TOKEN', channels: {} };
  await ensureSocialSchema(env);
  try {
    const f = await env.DB.prepare("SELECT value FROM pipeline_flags WHERE key='social_paused'").first();
    if (f && String(f.value).trim() === '1') return { skipped: 'paused', channels: {} };
  } catch (e) { return { skipped: 'gate-error', channels: {} }; }
  const caps = await channelCaps(env);
  const epoch = await capEpoch(env);
  const shares = await attentionShares(env);
  // LEARNER-CHANNEL-ARM-1: the channels in the order of the learner's draws, so the best-drawn channel picks content first.
  const co = await learnerChannelOrder(env);
  out.caps = caps; out.shares = shares; out.channel_order = co.order; out.channel_draws = co.draws || null;
  let bc = null, liMode = null;
  for (const channel of co.order) {
    // ATTENTION-SHARE-1: the owner's cap times the channel's attention share (never above the cap).
    const cap = shareCap(caps[channel], shares[channel]);
    if (!cap) { out.channels[channel] = caps[channel] && shares[channel] === 0 ? 'held:attention-stop' : 'held:cap-0'; continue; }
    let w;
    try { w = await channelWindow(env, channel, epoch); } catch (e) { out.channels[channel] = 'held:gate-error'; continue; }
    if (w.n >= cap) { out.channels[channel] = 'held:weekly-cap(' + w.n + '/' + cap + ')'; continue; }
    const spacing = Math.floor(7 * 864e5 / cap) - 36e5;
    if (w.lastMs != null && nowMs - w.lastMs < spacing) { out.channels[channel] = 'held:spacing(next ' + new Date(w.lastMs + spacing).toISOString().slice(0, 16) + 'Z)'; continue; }
    let row;
    try { row = await pickChannelRow(env, channel, epoch); } catch (e) { out.channels[channel] = 'held:pick-error'; continue; }
    if (!row) { out.channels[channel] = 'held:no-content'; continue; }
    let rawPosts = [];
    try { rawPosts = JSON.parse(row.posts); } catch (e) {}
    if (!Array.isArray(rawPosts) || !rawPosts.length) { out.channels[channel] = 'held:bad-posts(' + row.slug + ')'; continue; }
    const cg = contentGate(rawPosts);
    if (!cg.ok) { out.channels[channel] = 'held:content-gate:' + cg.reason + '(' + row.slug + ')'; continue; }
    const rd = row.doi ? reachDenied(row.title, '') : '';
    if (rd && !/^selected: released by owner card/.test(String(row.notes || ''))) { out.channels[channel] = 'held:reach-select(' + row.slug + ')'; continue; }
    let link = null;
    for (const pt of cg.texts) { const u = extractUrls(String(pt)); if (u.length) { link = u[0]; break; } }
    if (link) {
      const p = await probeLink(link);
      if (p.verdict !== 'live') { out.channels[channel] = 'held:link-' + p.verdict + '(' + row.slug + ')'; continue; }
    }
    if (!bc) {
      try { bc = await bufferChannels(env); } catch (e) { bc = { error: String(e && e.message || e) }; }
      if (bc.error) { out.channels[channel] = 'error:' + bc.error; out.error = bc.error; break; }
      liMode = await linkedinMode(env);
    }
    const ch = (bc.channels || []).find(function(c) { return c.service === channel && !c.isDisconnected; });
    if (!ch) { out.channels[channel] = 'held:no-channel'; continue; }
    const text = utmTagText(channelText(channel, cg.texts, link, row.title), BUFFER_UTM_SOURCE[channel] || channel, String(row.slug));
    const res = await bufferCreate(env, ch, channel, text, liMode);
    if (res.post_id && res.status !== 'error') {
      await recordChannelPost(env, channel, row.slug, res, text, 'channel-drain');
      out.posted++;
      out.channels[channel] = 'posted:' + res.status + ':' + row.slug + ':' + res.post_id;
    } else out.channels[channel] = 'error:' + String(res.error || res.status).slice(0, 80) + '(' + row.slug + ')';
  }
  return out;
}
function channelsRunStatus(c) {
  if (!c || c.error) return 'error';
  if (c.skipped) return c.skipped === 'gate-error' ? 'error' : 'skipped';
  const vals = Object.keys(c.channels || {}).map(function(k) { return c.channels[k]; });
  if (vals.some(function(v) { return /^error:/.test(v) || /^held:(gate-error|pick-error)/.test(v); })) return 'degraded';
  return 'ok';
}

// LINKEDIN-OWNER-DELEGATED-1: 'publish' unless pipeline_flags.linkedin_mode is exactly 'draft'.
async function linkedinMode(env) {
  try {
    const f = await env.DB.prepare("SELECT value FROM pipeline_flags WHERE key='linkedin_mode'").first();
    return f && String(f.value) === "draft" ? "draft" : "publish";
  } catch (e) { return "publish"; }
}
// BUFFER-CHANNEL-AUDIT-1: once per UTC day (first */2h tick), record every Buffer channel and its connection state, so
// "is LinkedIn connected" is a D1 fact (social_channels) instead of a question for the owner. A failed read is logged,
// never written as "disconnected".
async function bufferChannelAudit(env, nowMs) {
  if (!env.BUFFER_TOKEN) return { skipped: "no BUFFER_TOKEN" };
  const day = new Date(nowMs || Date.now()).toISOString().slice(0, 10);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_channels (channel_id TEXT PRIMARY KEY, service TEXT, name TEXT, connected INTEGER, checked_at TEXT, checked_day TEXT)").run();
  const done = await env.DB.prepare("SELECT 1 AS x FROM social_channels WHERE checked_day=?1 LIMIT 1").bind(day).first();
  if (done) return { throttled: day };
  const orgRes = await bufferGql(env, "{ account { organizations { id } } }");
  const orgs = (orgRes && orgRes.data && orgRes.data.account && orgRes.data.account.organizations) || [];
  if (!orgs.length) { await logAlert(env, "buffer-channels", "error", "BUFFER-CHANNEL-AUDIT-1: no Buffer organization (token rejected or empty)"); return { error: "no org" }; }
  const chRes = await bufferGql(env, "{ channels(input: { organizationId: \"" + orgs[0].id + "\" }) { id service name isDisconnected } }");
  const channels = (chRes && chRes.data && chRes.data.channels) || [];
  const iso = new Date(nowMs || Date.now()).toISOString();
  const st = channels.map(function(c) {
    return env.DB.prepare("INSERT INTO social_channels (channel_id, service, name, connected, checked_at, checked_day) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(channel_id) DO UPDATE SET service=excluded.service, name=excluded.name, connected=excluded.connected, checked_at=excluded.checked_at, checked_day=excluded.checked_day").bind(String(c.id), String(c.service || ""), String(c.name || ""), c.isDisconnected ? 0 : 1, iso, day);
  });
  if (st.length) await env.DB.batch(st);
  const li = channels.filter(function(c) { return c.service === "linkedin"; });
  if (!li.some(function(c) { return !c.isDisconnected; })) await logAlert(env, "buffer-channels", "error", "BUFFER-CHANNEL-AUDIT-1: no connected LinkedIn channel in Buffer (" + channels.length + " channels)");
  return { day: day, channels: channels.map(function(c) { return c.service + (c.isDisconnected ? ":disconnected" : ":connected"); }) };
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
    // REACH-SELECT-1: a held draft about a paper STRATEGY keeps out of outreach is never approved by a recheck.
    var rel = reachEligible(String(row.title || ""), abstract, row.doi);
    if (!rel.ok) {
      await env.DB.prepare("UPDATE social_threads SET status='suppressed', notes=? WHERE id=? AND status='draft'").bind("REACH-SELECT-1: " + rel.reason, row.id).run();
      skipped++;
      continue;
    }
    var issues = await checkThread(env, String(row.title || ""), abstract, posts, row.doi);
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
  // ATTENTION-SHARE-1 (0.8.0): the attention share scales the Bluesky cap, never above it; share 0 holds every post.
  const shares = await attentionShares(env);
  const cap = shareCap(weeklyCap(env), shares.bluesky);
  if (shares.bluesky === 0) { console.log('ATTENTION-SHARE-1 ' + who + ': bluesky share 0 (scorecard ' + (shares.day || 'n/a') + '), holding every post'); return { allowed: 0, reason: 'attention-stop', cap: 0, share: 0 }; }
  try {
    const f = await env.DB.prepare("SELECT value FROM pipeline_flags WHERE key='social_paused'").first();
    if (f && String(f.value).trim() === '1') {
      console.log('SOCIAL-PAUSE-1 ' + who + ': pipeline_flags.social_paused=1, posting nothing');
      return { allowed: 0, reason: 'paused', cap: cap };
    }
    // SOCIAL-CAP-EPOCH-1 (0.7.30, owner direction 2026-10-02 "bring users"): the 2-per-week cap was counting 96 posts from
    // the volume regime STRATEGY-1 retired on 2026-10-01 (79 q08 essays, 17 automatic paper posts), which held the curated
    // launch queue for a week. pipeline_flags.social_cap_epoch (a UTC 'YYYY-MM-DD HH:MM:SS') starts the count no earlier
    // than the reset; the cap itself is unchanged. Delete the flag to count the plain rolling 7 days again.
    let epoch = '0';
    try { const ef = await env.DB.prepare("SELECT value FROM pipeline_flags WHERE key='social_cap_epoch'").first(); if (ef && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(ef.value || '').trim())) epoch = String(ef.value).trim(); } catch (e) {}
    const c = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM social_threads WHERE status='posted' AND posted_at >= MAX(datetime('now','-7 days'), ?1)) + (SELECT COUNT(*) FROM dissemination_tracker WHERE action='posted' AND channel='bluesky' AND posted_at >= MAX(datetime('now','-7 days'), ?1)) AS n").bind(epoch).first();
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
async function recordPostUriBySlug(env, slug, value) {
  if (!value || !slug) return;
  await ensureSocialSchema(env);
  await env.DB.prepare("UPDATE social_threads SET post_uri=?, updated_at=datetime('now') WHERE slug=?").bind(value, slug).run();
}
// POST-ID-UTM-1 (0.7.21): status='posted' and post_uri land in ONE statement, so a posted row can no longer exist without
// its platform id because a second write was lost. Fallback (column missing): mark posted, then the fail-soft id write.
// POST-SENT-TEXT-1 (0.7.31, #1712): `sent` (the texts as posted, from postThread's collector) replaces `posts`, so a posted
// row records what went out, UTM tags included; without it the row keeps its draft text.
function sentPostsJson(sent) {
  return Array.isArray(sent) && sent.length && sent.every(function(t) { return typeof t === 'string' && t; }) ? JSON.stringify(sent) : null;
}
async function markPosted(env, id, uriValue, sent) {
  await ensureSocialSchema(env);
  const postsJson = sentPostsJson(sent);
  try {
    await env.DB.prepare("UPDATE social_threads SET status='posted', posted_at=datetime('now'), error=NULL, post_uri=COALESCE(?1, post_uri), posts=COALESCE(?3, posts), updated_at=datetime('now') WHERE id=?2").bind(uriValue || null, id, postsJson).run();
  } catch (e) {
    console.log('POST-ID-UTM-1 combined posted write failed for thread ' + id + ', falling back: ' + String(e).slice(0, 120));
    await env.DB.prepare("UPDATE social_threads SET status='posted', posted_at=datetime('now'), error=NULL, posts=COALESCE(?2, posts) WHERE id=?1").bind(id, postsJson).run();
    await recordPostUri(env, id, uriValue);
  }
}
// SOCIAL-ADHOC-GATE-1 (0.7.21, #1712/#1713): the HTTP routes that publish (/post, /thread, /cross, /broadcast, /repost)
// used to skip the pause flag, the weekly cap and the post-id record, so anything calling them through qnfo-ai's social
// tool posted outside every gate and left no row. They now pass the same gates as the cron drains and record a
// social_threads row with post_uri, which also makes the post count toward the weekly cap.
async function routeGate(env, who, texts, opts) {
  opts = opts || {};
  const g = await socialGate(env, who);
  if (g.reason === 'paused' || g.reason === 'gate-error') return { status: g.reason === 'paused' ? 423 : 503, body: { error: 'social posting held: ' + g.reason, reason: g.reason } };
  if (!opts.skipCap && !g.allowed) return { status: 429, body: { error: 'weekly cadence cap reached', reason: g.reason, posted_7d: g.posted_7d, cap: g.cap } };
  const c = contentGate(texts);
  if (!c.ok) return { status: 422, body: { error: 'content gate: ' + c.reason, reason: c.reason } };
  return { texts: c.texts };
}
async function recordAdhoc(env, kind, title, texts, uriValue) {
  await ensureSocialSchema(env);
  const slug = kind + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try {
    await env.DB.prepare("INSERT INTO social_threads (slug, title, posts, status, posted_at, post_uri, flags, updated_at) VALUES (?,?,?,'posted',datetime('now'),?,?,datetime('now'))").bind(slug, String(title || '').slice(0, 300), JSON.stringify(texts || []), uriValue || null, 'adhoc-route').run();
  } catch (e) { console.log('SOCIAL-ADHOC-GATE-1 record failed ' + slug + ': ' + String(e).slice(0, 120)); }
  return slug;
}

// SOCIAL-ENGAGEMENT-SELF-1 (0.7.21, #1647): social_engagements stopped at 2026-09-20 because its only collector, the
// weekly qnfo-cloud-ops "engagement" job, missed its 2026-09-27 run (no job-run row that day) and reads only the 30 newest
// feed items. qnfo-social now also collects, daily in its 07:00 UTC cron, likes/reposts/replies/quotes for every Bluesky
// post it recorded an id for in the last 60 days (social_threads.post_uri + dissemination_tracker.post_id). It reads the
// public AppView (no credential) and writes the same (platform, post_id, metric, collected_at) key as qnfo-cloud-ops, so
// the two collectors upsert the same rows instead of duplicating them.
function blueskyUriOf(v) {
  const s = String(v || '').trim();
  if (s.indexOf('at://') === 0) return s;
  if (s.charAt(0) === '{') { try { const o = JSON.parse(s); if (o && typeof o.bluesky === 'string' && o.bluesky.indexOf('at://') === 0) return o.bluesky; } catch (e) {} }
  return null;
}
async function collectEngagement(env) {
  const day = new Date().toISOString().slice(0, 10);
  const uris = [];
  const seen = {};
  const add = function(u) { if (u && !seen[u] && uris.length < 100) { seen[u] = 1; uris.push(u); } };
  await ensureSocialSchema(env);
  try {
    const a = await env.DB.prepare("SELECT post_uri FROM social_threads WHERE status='posted' AND post_uri IS NOT NULL AND post_uri<>'' AND posted_at >= datetime('now','-60 days') ORDER BY posted_at DESC LIMIT 100").all();
    for (const r of (a.results || [])) add(blueskyUriOf(r.post_uri));
  } catch (e) { console.log('SOCIAL-ENGAGEMENT-SELF-1 social_threads read failed: ' + String(e).slice(0, 120)); }
  try {
    const b = await env.DB.prepare("SELECT post_id FROM dissemination_tracker WHERE action='posted' AND channel='bluesky' AND post_id LIKE 'at://%' AND posted_at >= datetime('now','-60 days') ORDER BY posted_at DESC LIMIT 100").all();
    for (const r of (b.results || [])) add(blueskyUriOf(r.post_id));
  } catch (e) { console.log('SOCIAL-ENGAGEMENT-SELF-1 dissemination read failed: ' + String(e).slice(0, 120)); }
  const stmts = [];
  let found = 0, errors = 0;
  for (let i = 0; i < uris.length; i += 25) {
    const chunk = uris.slice(i, i + 25);
    try {
      const r = await fetch('https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?' + chunk.map(function(u) { return 'uris=' + encodeURIComponent(u); }).join('&'), { headers: { 'User-Agent': 'qnfo-social/' + VERSION } });
      if (!r.ok) { errors++; continue; }
      const j = await r.json();
      for (const p of (j && j.posts) || []) {
        found++;
        const m = { likes: p.likeCount, reposts: p.repostCount, replies: p.replyCount, quotes: p.quoteCount };
        for (const k of Object.keys(m)) {
          stmts.push(env.DB.prepare("INSERT INTO social_engagements (platform, post_id, metric, value, note, collected_at) VALUES (?,?,?,?,?,?) ON CONFLICT(platform, post_id, metric, collected_at) DO UPDATE SET value=excluded.value").bind('bluesky', String(p.uri), k, Number(m[k] || 0), 'qnfo-social', day));
        }
      }
    } catch (e) { errors++; }
  }
  if (stmts.length) await env.DB.batch(stmts);
  const out = { day: day, uris: uris.length, posts_found: found, rows: stmts.length, errors: errors };
  console.log('SOCIAL-ENGAGEMENT-SELF-1 ' + JSON.stringify(out));
  return out;
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
async function drainDissemination(env, opts) {
  opts = opts || {};
  await env.DB.prepare("UPDATE dissemination_tracker SET action='failed', updated_at=datetime('now') WHERE action='posting' AND updated_at < datetime('now','-1 hour')").run();
  await env.DB.prepare("UPDATE dissemination_tracker SET action='queued', retry_count=COALESCE(retry_count,0)+1, updated_at=datetime('now') WHERE action='failed' AND COALESCE(retry_count,0) < 3 AND updated_at < datetime('now','-30 minutes')").run();
  const cap = await env.DB.prepare("SELECT COUNT(*) n FROM dissemination_tracker WHERE action='posted' AND posted_at >= datetime('now','start of day')").first();
  const postedToday = (cap && cap.n) || 0;
  if (postedToday >= DRAIN_DAILY_CAP) return { skipped: 'daily-cap', posted_today: postedToday };
  const gate = await socialGate(env, 'drainDissemination');
  if (!gate.allowed) return { skipped: gate.reason || 'weekly-cap', posted_7d: gate.posted_7d, cap: gate.cap };
  // SOCIAL-DISTRIBUTION-LEARNER-1: with the learner on, this queue posts only the row the learner chose, in its slot.
  const lrn = await learnerEnabled(env);
  let posted = 0, failed = 0, learner;
  for (let i = 0; i < DRAIN_PER_RUN && posted < gate.allowed; i++) {
    let row = null, decision = null;
    if (lrn.on) {
      const pk = await learnerPick(env, 'dissem', opts.nowMs);
      if (pk.hold) { learner = learner && learner.posted ? learner : pk.summary; break; }
      if (pk.row) { row = pk.row; decision = pk.decision; }
      else if (pk.error) learner = { error: pk.error, fallback: 'old order' };
    }
    if (!row) row = await env.DB.prepare("SELECT * FROM dissemination_tracker WHERE action='queued' AND channel='bluesky' ORDER BY created_at ASC LIMIT 1").first();
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
      // OWNER-VOICE-CONTENT-GATE-1: repair mojibake in the title; never post a q08.org link or unrepairable text.
      const cg = contentGate([String(row.paper_title || row.paper_slug) + " \u2014 " + link]);
      if (!cg.ok) {
        await env.DB.prepare("UPDATE dissemination_tracker SET action=?, post_text_snippet=?, updated_at=datetime('now') WHERE id=?").bind(cg.reason === 'q08-link' ? 'suppressed' : 'held', 'CONTENT-GATE: ' + cg.reason + ' - not posted', row.id).run();
        console.log("CONTENT_GATE dissemination " + row.id + " " + cg.reason);
        continue;
      }
      const text = cg.texts[0];
      const embedTitle = repairMojibake(String(row.paper_title || 'QNFO'));
      const s = await session(env);
      const r = await postText(s, text, null, { embed: { title: embedTitle, desc: 'QNFO research \u2014 open access' }, campaign: row.paper_slug ? String(row.paper_slug) : undefined });
      // post_id = the at:// URI (retractDeadLinks deletes by it); post_url = the public bsky.app permalink.
      const rkey = String(r.uri || '').split('/').pop();
      const handle = String((s && s.handle) || env.BSKY_HANDLE || '');
      const postUrl = handle && rkey ? 'https://bsky.app/profile/' + handle + '/post/' + rkey : r.uri;
      // POST-SENT-TEXT-1 (0.7.31, #1712): post_text_snippet holds the text as posted (UTM tag included) on success.
      await env.DB.prepare("UPDATE dissemination_tracker SET action='posted', posted_at=datetime('now'), post_url=?, post_id=?, post_text_snippet=COALESCE(?, post_text_snippet), updated_at=datetime('now') WHERE id=?").bind(postUrl, r.uri, typeof r.stored_text === 'string' && r.stored_text ? r.stored_text : (typeof r.text === 'string' && r.text ? r.text : null), row.id).run();
      posted++;
      if (decision) learner = await learnerRecordPost(env, decision, r.uri, opts.nowMs);
    } catch (e) {
      failed++;
      await env.DB.prepare("UPDATE dissemination_tracker SET action='failed', post_text_snippet=?, updated_at=datetime('now') WHERE id=?").bind(String(e).slice(0, 180), row.id).run();
    }
  }
  const out = { posted, failed };
  if (lrn.on) out.learner = learner || { on: true };
  return out;
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
async function drainQueue(env, opts) {
  opts = opts || {};
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
  // SOCIAL-DISTRIBUTION-LEARNER-1: only now, with capacity granted by the gate above, may the learner choose the row and
  // its slot. It holds (posts nothing) until the chosen slot, or while its choice belongs to the dissemination queue.
  // Learner off, or no answer from it: the old order below (selected rows first, then oldest id).
  const lrn = await learnerEnabled(env);
  let posted = 0, failed = 0, learner;
  const buffer = [];
  for (let i = 0; i < DRAIN_PER_RUN && posted < gate.allowed; i++) {
    let row = null, decision = null;
    if (lrn.on) {
      const pk = await learnerPick(env, 'thread', opts.nowMs);
      if (pk.hold) { learner = learner && learner.posted ? learner : pk.summary; break; }
      if (pk.row) { row = pk.row; decision = pk.decision; }
      else if (pk.error) learner = { error: pk.error, fallback: 'old order' };
    }
    if (!row) row = await env.DB.prepare("SELECT * FROM social_threads WHERE status='queued' ORDER BY CASE WHEN COALESCE(flags,'') LIKE '%selected%' OR COALESCE(notes,'') LIKE 'selected%' THEN 0 ELSE 1 END, id ASC LIMIT 1").first();
    if (!row) break;
    try {
      await env.DB.prepare("UPDATE social_threads SET status='posting' WHERE id=? AND status='queued'").bind(row.id).run();
      const rawPosts = JSON.parse(row.posts);
      if (!Array.isArray(rawPosts) || !rawPosts.length) throw new Error('bad posts payload');
      // OWNER-VOICE-CONTENT-GATE-1: q08.org link -> suppressed; mojibake that cannot be repaired -> held. Neither posts.
      const cg = contentGate(rawPosts);
      if (!cg.ok) {
        await env.DB.prepare("UPDATE social_threads SET status=?, error=?, updated_at=datetime('now') WHERE id=?").bind(cg.reason === 'q08-link' ? 'suppressed' : 'held', 'CONTENT-GATE: ' + cg.reason + ' - not posted', row.id).run();
        console.log("CONTENT_GATE thread " + row.id + " " + cg.reason);
        continue;
      }
      // REACH-SELECT-1 (last line of defence): a thread about a pillar-4 / speculative-theory paper is not posted unless the
      // owner released it himself (owner queue card).
      const rd = row.doi ? reachDenied(row.title, '') : '';
      if (rd && !/^selected: released by owner card/.test(String(row.notes || ''))) {
        await env.DB.prepare("UPDATE social_threads SET status='suppressed', error=?, updated_at=datetime('now') WHERE id=?").bind("REACH-SELECT-1: STRATEGY 2.3 ('" + rd + "') - not posted", row.id).run();
        console.log("REACH_SELECT thread " + row.id + " " + rd);
        continue;
      }
      const posts = cg.texts;
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
      const sent = [];
      const uris = await postThread(s, posts, { link: threadLink, embed: threadLink ? { title: repairMojibake(String(row.title || 'QNFO')), desc: 'QNFO research' } : undefined, campaign: row.slug ? String(row.slug) : undefined, sent: sent });
      // Buffer (Mastodon/LinkedIn/X) posts plain text with no facet/embed support - the
      // link MUST be applied to the text itself here, mirroring what postThread() does
      // internally for Bluesky's post 1. Previously this sent the raw linkless posts[0].
      let bufferResult = null;
      try {
        const bufText = pickBufferText(posts, threadLink, row.title, 280);
        bufferResult = await bufferPost(env, bufText, row.slug ? String(row.slug) : undefined);
      } catch (e) { bufferResult = { error: String(e && e.message || e) }; }
      // POST-ID-UTM-1 (#1712): status, platform ids and (POST-SENT-TEXT-1) the posted text in one write (markPosted falls
      // back if the column is missing).
      await markPosted(env, row.id, postUriValue(uris[0], bufferResult), sent);
      posted++;
      if (decision) learner = await learnerRecordPost(env, decision, uris[0], opts.nowMs);
      // SOCIAL-RUN-LEDGER-1: what Buffer did with this post, per platform, for the run record.
      if (bufferResult && Array.isArray(bufferResult.results)) for (const br of bufferResult.results) buffer.push(String(br.platform || 'buffer') + ':' + String(br.status || '?'));
      else if (bufferResult) buffer.push('buffer:' + (bufferResult.skipped ? 'skipped' : 'error'));
      console.log('drain posted thread', row.slug, uris[0], 'buffer:', JSON.stringify(bufferResult).slice(0, 200));
    } catch (e) {
      failed++;
      await env.DB.prepare("UPDATE social_threads SET status='failed', error=?, retry_count=retry_count+1 WHERE id=?").bind(String(e).slice(0, 300), row.id).run();
      await logAlert(env, 'cron', 'error', 'drain post failed ' + row.slug + ': ' + String(e));
      console.error('drain post failed', row.slug, String(e));
    }
  }
  const out = { posted: posted, failed: failed, posted_today: postedToday + posted, buffer: buffer };
  if (lrn.on) out.learner = learner || { on: true };
  return out;
}

// SOCIAL-RUN-LEDGER-1 (0.7.27, pillar: reach; WATCHMAKER-INDEX-1). The profile sync, the posting drain (Bluesky plus the
// Buffer cross-post to Mastodon, LinkedIn and X), the Zenodo scan and the engagement collector logged only to the console,
// so the fleet could not tell a quiet run from a dead one. Each run now upserts ONE cloud_ops_events row per operation
// per UTC day, id social-<op>-<yyyy-mm-dd> (kind social-run, job qnfo-social): ts, status and text describe the latest
// run, meta.runs counts the day's runs, and meta.last_ok carries forward the time of the last run that completed
// ('ok' or 'degraded'), so a later failed run never hides the last good one. Status: ok | degraded (ran, but a part
// failed, e.g. a Buffer channel refused a post) | error | skipped (no credentials). Two rows a day for the 2-hourly
// tick, one each for the daily scan and collector. A ledger write failure is logged and never stops the run.
// Watchmaker proof: SELECT MAX(json_extract(meta, '$.last_ok')) FROM cloud_ops_events WHERE id range social-<op>-.
function socialRunJson(op, status, result, iso) {
  const done = status === 'ok' || status === 'degraded';
  let r = result === undefined ? null : result;
  let s = JSON.stringify({ op: op, version: VERSION, result: r, last_ok: done ? iso : null, runs: 1 });
  if (s.length > 3000) s = JSON.stringify({ op: op, version: VERSION, result: String(JSON.stringify(r)).slice(0, 2500), last_ok: done ? iso : null, runs: 1 });
  return s;
}
async function recordSocialRun(env, op, status, result, nowMs) {
  const iso = new Date(nowMs || Date.now()).toISOString();
  const id = 'social-' + op + '-' + iso.slice(0, 10);
  const text = ('qnfo-social ' + op + ' ' + status + ' ' + JSON.stringify(result === undefined ? null : result)).slice(0, 500);
  try {
    await env.DB.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'social-run', ?3, ?4, 'qnfo-social', ?5) ON CONFLICT(id) DO UPDATE SET ts = excluded.ts, text = excluded.text, status = excluded.status, meta = json_set(excluded.meta, '$.last_ok', COALESCE(json_extract(excluded.meta, '$.last_ok'), json_extract(cloud_ops_events.meta, '$.last_ok')), '$.runs', COALESCE(json_extract(cloud_ops_events.meta, '$.runs'), 0) + 1)").bind(id, iso, text, socialRunJson(op, status, result, iso), status).run();
    return id;
  } catch (e) {
    console.log('SOCIAL-RUN-LEDGER-1 ' + op + ' record failed: ' + String(e && e.message || e).slice(0, 160));
    return null;
  }
}
function profileRunStatus(ps) {
  if (!ps || ps.error) return 'error';
  if (ps.skipped) return 'skipped';
  return 'ok';   // updated, unchanged, or held because the owner edited the bio
}
function drainRunStatus(q, d) {
  const bad = function(x) { return !x || x.error || x.skipped === 'gate-error'; };
  if (bad(q) || bad(d)) return 'error';
  if (q.failed || d.failed || (q.buffer || []).some(function(b) { return /:(error|no-channel)$/.test(b); })) return 'degraded';
  return 'ok';
}
function engagementRunStatus(o) {
  if (!o || o.error) return 'error';
  if (o.errors && !o.posts_found) return 'error';
  return o.errors ? 'degraded' : 'ok';
}

// ---------- SOCIAL-DISTRIBUTION-LEARNER-1 (0.7.28, pillar: reach; STRATEGY 6.4 "distribution allocation (weekly)") ----------
// Owner directive 2026-10-02: the fleet measures its external effectiveness and changes itself to improve the metrics. This
// bandit chooses WHICH queued post goes out next and WHEN. It never adds a post: it is asked only after socialGate granted
// capacity (pause flag, weekly cap), it chooses among rows already queued (fact-checked threads and the dissemination
// queue), every row it chooses still passes the content gate and link checks, and with the learner on its posts are at
// least 24h apart (two posts two hours apart would spend the week's cap in one morning). It never rewrites text.
//
// Arms, factorised. Three independent Beta posteriors, one per dimension, instead of one per cell of the 3 x 3 x 3 cross
// product: at 1-2 posts a week a 27-cell table would take years before most cells had a second observation, while every
// post updates all three marginals at once, so each value has a few observations after about ten posts. The price is that
// interactions (questions working only for one topic, say) are not modelled.
//   topic  : energy (JPCUB, selected works 1-4), epistemics (works 5-6), operations (work 7): STRATEGY 2.3 pillars 1-3.
//            Selected-work DOIs map directly, other rows by title and text keywords. Pillar 4 (ultrametric), q08 and
//            anything unclassified are not arms: such a row keeps its old place behind every arm row and earns no reward.
//   format : what the queue genuinely holds (the learner can only choose among them): single (one post: the launch-queue
//            claim/test/status posts, the dissemination "title - link" card), thread (the composer's 5-post thread with a
//            statement hook) and question (the first sentence of the first post is a question: the composer's "provocative
//            question" hook, or a title that asks one).
//   slot   : the :30 ticks of the 2-hourly cron in three UTC windows: eu-morning 08:30 and 10:30, us-morning 14:30 and
//            16:30, us-afternoon 18:30 and 20:30. A chosen post waits for its slot (at most about 22h).
// Decision. When capacity exists and the last learner post is 24h old: draw theta from every Beta, score each queued arm
// row theta_topic x theta_format, take the best (ties keep the old order, selected rows first), take the slot with the
// highest draw. The decision is kept in ops_config social_learner_pending until it is posted, its row leaves the queue or
// it is 48h old (drawing again every tick would favour early slots), and logged as cloud_ops_events
// social-learner-decision-* with every draw and the scored candidates.
// Reward, once per post, after its 72h window, in the weekly update. social_learner_posts holds one row per post, status
// pending -> credited | no-data (one UPDATE ... WHERE status = 'pending'), so no post counts twice:
//   e = likes + reposts + quotes + replies from others on the root post at the last daily social_engagements snapshot
//       inside 72h (a thread's own first reply is subtracted, or every thread would start with a free reply);
//   v = paper-page views the post plausibly caused: CF RUM pageviews (reach_signals cf-rum, entity paper) of the linked
//       papers.qnfo.org/papers/<slug> on the post day and the two days after, minus 3 x its mean daily views over the 7 days
//       before; only when all 3 window days and 3+ baseline days were ingested, else e alone. Not available: UTM campaigns
//       (RUM paths carry no query string and GA4 is retired), referrers per post (reach_signals referrer hosts are site-wide
//       per day), subscriptions per post (the subscribers table has no campaign), impressions (Bluesky reports none) and
//       Buffer channel metrics (none in D1).
//   r = 1 - exp(-(e + v / 5) / 2), in [0, 1): one engagement 0.39, three 0.78; five extra views weigh as one engagement.
//       Each dimension's Beta(1, 1) prior takes alpha += r, beta += 1 - r. The posterior is recomputed from the credited rows
//       on every read, so there is no counter to drift or double-count.
// Weekly update: Mondays in the 07:00Z cron after the engagement collector, or on a later day when the last completed
// update is 7 or more days old. It also files Bluesky posts the learner did not choose (the dissemination drain, the HTTP
// routes) so they teach it too, and records next week's allocation (the share of 2000 posterior draws each arm wins) in the
// run ledger row social-learner-update-<day> (WATCHMAKER_OPS social-learner). metric_registry social_engagement_rate_30d
// is refreshed daily in the same cron, whatever the switch says (it is measurement only).
// Kill switch: ops_config social_learner_enabled ('0', 'off', 'false', 'no', 'disabled' = off; absent = on; unreadable =
// off). Off is the 0.7.27 order and timing exactly, and the weekly update records 'skipped'.
var LEARNER_TOPICS = ['energy', 'epistemics', 'operations'];
// LEARNER-CHANNEL-ARM-1 (0.8.1, 2026-10-06; transformation lever T7.13): a fourth arm dimension, the channel. The Buffer
// channel posts the drain records (social_media_posts, platform buffer-<service>) become learner rows (post_key
// channel:<id>, chosen_by channel-drain) with the thread's topic and format, credited from the reach ledger's buffer rows
// (reach_signals source buffer, per channel post: reactions + comments + reposts + shares + clicks + quotes at the last
// snapshot inside the 72h window; Buffer reports metrics about 24h after a post, so a closed window waits one more day
// before it reads no-data). The posterior then carries a channel allocation, and the channel drain visits the channels in
// the order of one Beta draw each (learnerChannelOrder), so the attention loop's shift of posts to the Buffer channels is
// an experiment the learner credits, not a pause. Bluesky rows carry channel 'bluesky'.
var LEARNER_CHANNELS = ['bluesky', 'linkedin', 'mastodon', 'x'];
var LEARNER_CHANNEL_OF = { 'buffer-linkedin': 'linkedin', 'buffer-mastodon': 'mastodon', 'buffer-x': 'x', 'buffer-twitter': 'x', linkedin: 'linkedin', mastodon: 'mastodon', twitter: 'x', x: 'x', bluesky: 'bluesky' };
var LEARNER_CHANNEL_GRACE_MS = 24 * 36e5;
var LEARNER_BUFFER_ENGAGEMENT = ['reactions', 'comments', 'reposts', 'shares', 'clicks', 'quotes'];
var LEARNER_FORMATS = ['single', 'thread', 'question'];
var LEARNER_SLOTS = { 'eu-morning': [8, 12], 'us-morning': [14, 18], 'us-afternoon': [18, 22] };   // UTC hours [from, to)
var LEARNER_EPOCH_SQL = '2026-10-02 00:00:00';   // posts before the learner (and before the STRATEGY-1 cadence) are not arms
var LEARNER_WINDOW_MS = 72 * 36e5;
var LEARNER_SNAPSHOT_UTC_H = 7;                  // a day's snapshot counts when its 07:00Z collection is inside the window
var LEARNER_CREDIT_GRACE_MS = 2 * 36e5;
var LEARNER_REWARD_SCALE = 2;
var LEARNER_VISITS_PER_ENGAGEMENT = 5;
var LEARNER_DECISION_TTL_MS = 48 * 36e5;
var LEARNER_MIN_GAP_MS = 24 * 36e5;              // learner posts at least 24h apart (so also one per tick)
var LEARNER_PBEST_DRAWS = 2000;
var LEARNER_METRIC = 'social_engagement_rate_30d';
var LEARNER_SELECTED_TOPIC = {
  '10.5281/zenodo.21637028': 'energy', '10.5281/zenodo.22261547': 'energy', '10.5281/zenodo.21821767': 'energy',
  '10.5281/zenodo.21945415': 'energy', '10.5281/zenodo.21901984': 'epistemics', '10.5281/zenodo.22026592': 'epistemics',
  '10.5281/zenodo.23079905': 'operations'
};
var LEARNER_TOPIC_RE = [
  ['energy', /\b(?:jpcub|joules?\b|landauer|thermodynamic (?:floor|cost|limit)|energy[- ](?:honest|per|cost|floor|efficien|budget))/i],
  ['epistemics', /\b(?:ignorance audits?|epistemic (?:legibility|repair|audit)|epistemics of ai|ai-assisted (?:science|claims?))\b/i],
  ['operations', /\b(?:quniverse|autonomous (?:cloud )?research (?:system|operations|fleet)|research fleet|worker fleet|self-maintaining research)/i]
];
var LEARNER_NOT_ARM_RE = /\b(?:ultrametric|adelic|p-adic|autaxic|topos)\b/i;
var learnerRng = Math.random;
function setLearnerRng(f) { learnerRng = typeof f === 'function' ? f : Math.random; }
function lr4(x) { return Math.round(x * 1e4) / 1e4; }
function learnerSqlTs(ms) { return new Date(ms).toISOString().replace('T', ' ').slice(0, 19); }
function learnerParseTs(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) return Date.parse(s.replace(' ', 'T') + 'Z');
  return Date.parse(s);
}
function learnerShiftDay(day, n) { return new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
function learnerChanges(r) { const c = r && r.meta && r.meta.changes; return typeof c === 'number' ? c : null; }

// ---- classification ----
function learnerPostsOf(raw) {
  let arr = raw;
  if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch (e) { arr = [raw]; } }
  if (!Array.isArray(arr)) arr = [];
  return arr.map(function(p) { return typeof p === 'string' ? p : String((p && p.text) || ''); }).filter(function(t) { return t.trim(); });
}
// Question-led: the first sentence (URLs removed; a decimal point is not a sentence end) ends with '?'.
function learnerIsQuestion(text) {
  const s = String(text || '').replace(/https?:\/\/\S+/g, ' ').trim();
  const m = /[.!?](?=["')\]]*(?:\s|$))/.exec(s);
  return !!m && m[0] === '?';
}
function learnerLinkSlug(text) {
  const m = /https?:\/\/(?:[a-z0-9-]+\.)*qnfo\.org\/papers\/([^\/?#\s"'<>()\[\]]+)/i.exec(String(text || ''));
  return m ? m[1] : null;
}
function learnerTopicOf(doi, text) {
  const s = String(text || '');
  if (Q08_LINK_RE.test(s)) return null;                       // never q08
  const d = String(doi || '').trim().toLowerCase();
  if (LEARNER_SELECTED_TOPIC[d]) return LEARNER_SELECTED_TOPIC[d];
  if (LEARNER_NOT_ARM_RE.test(s)) return null;                // pillar 4 stays out of outreach (STRATEGY 2.3)
  for (const t of LEARNER_TOPIC_RE) if (t[1].test(s)) return t[0];
  return null;
}
function learnerClassify(row, source) {
  row = row || {};
  if (source === 'dissem') {
    const title = String(row.paper_title || row.paper_slug || '');
    const link = String(row.pages_url || '');
    return { topic: learnerTopicOf(row.paper_doi, title + '\n' + link), format: learnerIsQuestion(title) ? 'question' : 'single', n_posts: 1,
      link_slug: learnerLinkSlug(link) || (row.paper_slug ? String(row.paper_slug) : null), slug: String(row.paper_slug || row.id || '') };
  }
  const posts = learnerPostsOf(row.posts);
  const all = posts.join('\n');
  let link = null;
  for (const p of posts) { link = learnerLinkSlug(p); if (link) break; }
  const format = learnerIsQuestion(posts[0] || '') ? 'question' : (posts.length >= 2 ? 'thread' : 'single');
  return { topic: learnerTopicOf(row.doi || findDoi(all), String(row.title || '') + '\n' + all), format: format, n_posts: posts.length, link_slug: link, slug: String(row.slug || row.id || '') };
}
function learnerSlotOf(ms) {
  const h = new Date(ms).getUTCHours();
  for (const k of Object.keys(LEARNER_SLOTS)) if (h >= LEARNER_SLOTS[k][0] && h < LEARNER_SLOTS[k][1]) return k;
  return null;
}

// ---- Beta posterior and Thompson draws ----
function learnerNormal(rng) {
  let u = 0;
  for (let k = 0; k < 64 && u <= 1e-12; k++) u = rng();
  if (u <= 1e-12) u = 0.5;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
// Marsaglia-Tsang gamma sampler; shape < 1 by the boost u^(1/k). Bounded loop: a pathological rng returns the mode.
function learnerGamma(k, rng) {
  if (!(k > 0)) return 0;
  if (k < 1) { const u = rng(); return learnerGamma(k + 1, rng) * Math.pow(u > 1e-12 ? u : 1e-12, 1 / k); }
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (let it = 0; it < 256; it++) {
    let x, v;
    do { x = learnerNormal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u > 1e-300 ? u : 1e-300) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d;
}
function learnerBeta(a, b, rng) {
  rng = rng || learnerRng;
  const x = learnerGamma(a, rng), y = learnerGamma(b, rng);
  return x + y > 0 ? x / (x + y) : 0.5;
}
function learnerPrior() {
  const mk = function(list) { const o = {}; for (const k of list) o[k] = { a: 1, b: 1, n: 0 }; return o; };
  return { topic: mk(LEARNER_TOPICS), format: mk(LEARNER_FORMATS), slot: mk(Object.keys(LEARNER_SLOTS)), channel: mk(LEARNER_CHANNELS) };
}
var LEARNER_SCHEMA_DBS = new WeakSet();
async function ensureLearnerSchema(env) {
  if (env.DB && typeof env.DB === 'object' && LEARNER_SCHEMA_DBS.has(env.DB)) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_learner_posts (post_key TEXT PRIMARY KEY, slug TEXT, bsky_uri TEXT, link_slug TEXT, topic TEXT, format TEXT, slot TEXT, n_posts INTEGER, posted_at TEXT, chosen_by TEXT, decision TEXT, status TEXT, engagement REAL, visits REAL, reward REAL, reward_detail TEXT, credited_at TEXT, created_at TEXT)").run();
  // LEARNER-CHANNEL-ARM-1: the channel and the Buffer post id ('duplicate column' once they exist, which is fine); rows
  // written before 0.8.1 are Bluesky rows.
  try { await env.DB.prepare("ALTER TABLE social_learner_posts ADD COLUMN channel TEXT").run(); } catch (e) {}
  try { await env.DB.prepare("ALTER TABLE social_learner_posts ADD COLUMN buffer_id TEXT").run(); } catch (e) {}
  try { await env.DB.prepare("UPDATE social_learner_posts SET channel = 'bluesky' WHERE channel IS NULL AND bsky_uri IS NOT NULL").run(); } catch (e) {}
  if (env.DB && typeof env.DB === 'object') LEARNER_SCHEMA_DBS.add(env.DB);
}
// alpha = 1 + sum(reward), beta = 1 + n - sum(reward) per dimension value, over credited posts only.
async function learnerPosterior(env) {
  const post = learnerPrior();
  const r = await env.DB.prepare("SELECT 'topic' AS dim, topic AS arm, COUNT(*) AS n, SUM(reward) AS s FROM social_learner_posts WHERE status = 'credited' AND topic IS NOT NULL GROUP BY topic UNION ALL SELECT 'format', format, COUNT(*), SUM(reward) FROM social_learner_posts WHERE status = 'credited' AND format IS NOT NULL GROUP BY format UNION ALL SELECT 'slot', slot, COUNT(*), SUM(reward) FROM social_learner_posts WHERE status = 'credited' AND slot IS NOT NULL GROUP BY slot UNION ALL SELECT 'channel', COALESCE(channel, 'bluesky'), COUNT(*), SUM(reward) FROM social_learner_posts WHERE status = 'credited' GROUP BY COALESCE(channel, 'bluesky')").all();
  for (const x of (r && r.results) || []) {
    const c = post[x.dim] && post[x.dim][x.arm];
    if (!c) continue;
    const n = Number(x.n) || 0, s = Math.min(n, Math.max(0, Number(x.s) || 0));
    c.n = n; c.a = lr4(1 + s); c.b = lr4(1 + n - s);
  }
  return post;
}
function learnerPosteriorSummary(post) {
  const out = {};
  for (const dim of Object.keys(post)) {
    out[dim] = {};
    for (const k of Object.keys(post[dim])) { const c = post[dim][k]; out[dim][k] = { a: c.a, b: c.b, n: c.n, mean: Math.round(c.a / (c.a + c.b) * 1000) / 1000 }; }
  }
  return out;
}
// Next week's allocation: the share of posterior draws each arm wins (what Thompson sampling will pick, before the queue
// restricts the choice).
function learnerPBest(post, draws, rng) {
  rng = rng || learnerRng;
  const out = {};
  for (const dim of Object.keys(post)) {
    const keys = Object.keys(post[dim]), wins = {};
    for (const k of keys) wins[k] = 0;
    for (let i = 0; i < draws; i++) {
      let best = null, bv = -1;
      for (const k of keys) { const v = learnerBeta(post[dim][k].a, post[dim][k].b, rng); if (v > bv) { bv = v; best = k; } }
      wins[best]++;
    }
    out[dim] = {};
    for (const k of keys) out[dim][k] = Math.round(wins[k] / draws * 1000) / 1000;
  }
  return out;
}
// The decision: cands in the old order; returns the chosen candidate's arms, the slot and every draw.
function learnerChoose(cands, post, rng, nowMs) {
  rng = rng || learnerRng;
  const samples = {};
  for (const dim of ['topic', 'format', 'slot', 'channel']) {
    if (!post[dim]) continue;
    samples[dim] = {};
    for (const k of Object.keys(post[dim])) samples[dim][k] = lr4(learnerBeta(post[dim][k].a, post[dim][k].b, rng));
  }
  const scored = cands.map(function(c, i) {
    const a = c.arms || {};
    return { c: c, i: i, score: a.topic && samples.topic[a.topic] !== undefined && samples.format[a.format] !== undefined ? lr4(samples.topic[a.topic] * samples.format[a.format]) : null };
  });
  let best = null;
  for (const s of scored) if (s.score !== null && (!best || s.score > best.score)) best = s;   // strict: a tie keeps the old order
  const viaArms = !!best;
  if (!best) best = scored[0];   // no arm row queued: the old order, still in a sampled slot
  let slot = null;
  for (const k of Object.keys(samples.slot)) if (slot === null || samples.slot[k] > samples.slot[slot]) slot = k;
  const a = best.c.arms || {};
  return {
    source: best.c.source, id: best.c.id, slug: a.slug || null, topic: a.topic || null, format: a.format || null, n_posts: a.n_posts || 1,
    link_slug: a.link_slug || null, slot: slot, score: best.score, via_arms: viaArms, samples: samples,
    candidates: scored.slice(0, 12).map(function(s) { return { source: s.c.source, id: s.c.id, topic: (s.c.arms || {}).topic || null, format: (s.c.arms || {}).format || null, score: s.score }; }),
    decided_at: new Date(nowMs || Date.now()).toISOString(), version: VERSION
  };
}

// ---- state, switch, logs ----
async function learnerEnabled(env) {
  try {
    const f = await env.DB.prepare("SELECT value FROM ops_config WHERE key = 'social_learner_enabled'").first();
    if (!f) return { on: true, reason: 'ops_config.social_learner_enabled absent (default on)' };
    const v = String(f.value == null ? '' : f.value).trim().toLowerCase();
    if (['0', 'off', 'false', 'no', 'disabled'].indexOf(v) >= 0) return { on: false, reason: 'ops_config.social_learner_enabled=' + v };
    return { on: true, reason: 'ops_config.social_learner_enabled=' + v };
  } catch (e) {
    return { on: false, reason: 'switch unreadable, old order: ' + String(e && e.message || e).slice(0, 120) };
  }
}
async function learnerState(env) {
  const r = await env.DB.prepare("SELECT value FROM ops_config WHERE key = 'social_learner_pending'").first();
  if (!r || !r.value) return {};
  try { const o = JSON.parse(r.value); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
async function learnerSaveState(env, st) {
  try {
    await env.DB.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES ('social_learner_pending', ?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, note = excluded.note, updated_at = excluded.updated_at").bind(JSON.stringify(st), 'SOCIAL-DISTRIBUTION-LEARNER-1 (qnfo-social): the post the learner chose next and when its last post left; written by the posting drain', new Date().toISOString()).run();
    return true;
  } catch (e) {
    console.log('SOCIAL-DISTRIBUTION-LEARNER-1 state write failed: ' + String(e && e.message || e).slice(0, 160));
    return false;
  }
}
async function learnerLogEvent(env, id, kind, status, text, meta, nowMs) {
  try {
    let m = JSON.stringify(meta === undefined ? null : meta);
    if (m.length > 6000) m = JSON.stringify({ clipped: true, head: m.slice(0, 5000) });
    await env.DB.prepare("INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, ?3, ?4, ?5, 'qnfo-social', ?6)").bind(String(id).slice(0, 200), new Date(nowMs || Date.now()).toISOString(), kind, String(text || '').slice(0, 500), m, status).run();
    return id;
  } catch (e) {
    console.log('SOCIAL-DISTRIBUTION-LEARNER-1 ' + kind + ' log failed: ' + String(e && e.message || e).slice(0, 160));
    return null;
  }
}
function learnerBrief(dec) {
  return dec ? { source: dec.source, id: dec.id, slug: dec.slug, topic: dec.topic, format: dec.format, slot: dec.slot, decided_at: dec.decided_at } : null;
}
async function learnerCandidates(env) {
  const out = [];
  const a = await env.DB.prepare("SELECT id, slug, title, doi, posts, flags, notes, created_at FROM social_threads WHERE status='queued' ORDER BY CASE WHEN COALESCE(flags,'') LIKE '%selected%' OR COALESCE(notes,'') LIKE 'selected%' THEN 0 ELSE 1 END, id ASC LIMIT 50").all();
  for (const r of (a && a.results) || []) out.push({ source: 'thread', id: r.id, row: r, arms: learnerClassify(r, 'thread') });
  const b = await env.DB.prepare("SELECT * FROM dissemination_tracker WHERE action='queued' AND channel='bluesky' ORDER BY created_at ASC LIMIT 50").all();
  for (const r of (b && b.results) || []) out.push({ source: 'dissem', id: r.id, row: r, arms: learnerClassify(r, 'dissem') });
  return out;
}

// ---- the scheduler's question: which row now, from which queue ('thread' = drainQueue, 'dissem' = drainDissemination)?
// Returns { row, decision } to post now, { hold, summary } to post nothing this tick, {} when the queues are empty, or
// { error } (the caller then uses the old order). Called only after socialGate granted capacity.
async function learnerPick(env, who, nowMs) {
  const now = nowMs || Date.now();
  try {
    await ensureLearnerSchema(env);
    const st = await learnerState(env);
    const lastMs = st.last_post_at ? Date.parse(st.last_post_at) : NaN;
    if (isFinite(lastMs) && now >= lastMs && now - lastMs < LEARNER_MIN_GAP_MS) return { hold: 'spacing', summary: { held: 'spacing', last_post_at: st.last_post_at, last_post_key: st.last_post_key || null, next_after: new Date(lastMs + LEARNER_MIN_GAP_MS).toISOString() } };
    const cands = await learnerCandidates(env);
    if (!cands.length) return {};
    let dec = st.decision || null;
    let cand = dec ? cands.find(function(c) { return c.source === dec.source && String(c.id) === String(dec.id); }) : null;
    const decMs = dec ? Date.parse(dec.decided_at) : NaN;
    if (!cand || !isFinite(decMs) || now - decMs > LEARNER_DECISION_TTL_MS) {
      const post = await learnerPosterior(env);
      dec = learnerChoose(cands, post, learnerRng, now);
      cand = cands.find(function(c) { return c.source === dec.source && String(c.id) === String(dec.id); });
      const logged = dec.candidates;
      delete dec.candidates;
      if (!(await learnerSaveState(env, { decision: dec, last_post_at: st.last_post_at || null, last_post_key: st.last_post_key || null }))) return { error: 'decision not persisted' };
      await learnerLogEvent(env, 'social-learner-decision-' + dec.decided_at + '-' + dec.source + '-' + dec.id, 'social-learner-decision', 'decided',
        'qnfo-social learner chose ' + dec.source + ':' + dec.id + ' (' + (dec.topic || 'not an arm') + ', ' + dec.format + ') for slot ' + dec.slot,
        { decision: dec, candidates: logged, posterior: learnerPosteriorSummary(post) }, now);
    }
    const slotNow = learnerSlotOf(now);
    if (slotNow !== dec.slot) return { hold: 'slot', summary: { held: 'slot', slot: dec.slot, now_slot: slotNow, chosen: learnerBrief(dec) } };
    if (dec.source !== who) return { hold: 'other-queue', summary: { held: 'other-queue', chosen: learnerBrief(dec) } };
    return { row: cand.row, decision: dec };
  } catch (e) {
    console.log('SOCIAL-DISTRIBUTION-LEARNER-1 pick failed, old order: ' + String(e && e.message || e).slice(0, 160));
    return { error: String(e && e.message || e).slice(0, 160) };
  }
}
// After the chosen post went out: its reward row (pending until the 72h window closes) and the 24h spacing marker.
async function learnerRecordPost(env, dec, bskyUri, nowMs) {
  const iso = new Date(nowMs || Date.now()).toISOString();
  const key = (dec.source === 'dissem' ? 'dissem:' : 'thread:') + dec.id;
  try {
    await ensureLearnerSchema(env);
    await env.DB.prepare("INSERT OR IGNORE INTO social_learner_posts (post_key, slug, bsky_uri, link_slug, topic, format, slot, n_posts, posted_at, chosen_by, decision, status, created_at, channel) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'learner', ?10, ?11, ?9, 'bluesky')")
      .bind(key, dec.slug || null, bskyUri || null, dec.link_slug || null, dec.topic || null, dec.format || null, dec.slot || null, Number(dec.n_posts) || 1, iso, JSON.stringify(dec), dec.topic ? 'pending' : 'not-arm').run();
  } catch (e) { console.log('SOCIAL-DISTRIBUTION-LEARNER-1 post record failed ' + key + ': ' + String(e && e.message || e).slice(0, 160)); }
  await learnerSaveState(env, { decision: null, last_post_at: iso, last_post_key: key });
  return { posted: key, topic: dec.topic, format: dec.format, slot: dec.slot };
}

// ---- reward ----
function learnerWindow(postedMs) {
  const end = postedMs + LEARNER_WINDOW_MS;
  return { from: new Date(postedMs).toISOString().slice(0, 10), to: new Date(end - LEARNER_SNAPSHOT_UTC_H * 36e5).toISOString().slice(0, 10), end: end };
}
// The snapshots inside each post's own window, 33 posts (99 bound parameters, D1 allows 100) per query: one D1 query per
// 33 posts instead of one per post, so the 07:00Z cron stays far below the per-invocation query limit.
async function learnerSnapshots(env, posts) {
  const out = {};
  for (let i = 0; i < posts.length; i += 33) {
    const chunk = posts.slice(i, i + 33), args = [];
    for (const p of chunk) { const w = learnerWindow(p.ms); args.push(String(p.uri), w.from, w.to); out[p.uri] = []; }
    const values = chunk.map(function(p, k) { return '(?' + (3 * k + 1) + ', ?' + (3 * k + 2) + ', ?' + (3 * k + 3) + ')'; }).join(', ');
    const r = await env.DB.prepare("WITH w(uri, f, t) AS (VALUES " + values + ") SELECT e.post_id, e.metric, e.value, e.collected_at FROM social_engagements e JOIN w ON e.post_id = w.uri AND e.collected_at >= w.f AND e.collected_at <= w.t WHERE e.platform = 'bluesky' ORDER BY e.collected_at DESC").bind(...args).all();
    for (const x of (r && r.results) || []) if (out[x.post_id]) out[x.post_id].push(x);
  }
  return out;
}
// rows newest first; the latest snapshot inside the window per metric (counts are cumulative).
function learnerEngagementOf(rows, nPosts) {
  const latest = {};
  let day = null;
  for (const r of rows || []) {
    const k = String(r.metric);
    if (latest[k] === undefined) latest[k] = Number(r.value) || 0;
    if (day === null || String(r.collected_at) > day) day = String(r.collected_at);
  }
  if (day === null) return null;
  const self = Number(nPosts) >= 2 ? 1 : 0;
  const likes = latest.likes || 0, reposts = latest.reposts || 0, quotes = latest.quotes || 0, replies = latest.replies || 0;
  return { e: likes + reposts + quotes + Math.max(0, replies - self), likes: likes, reposts: reposts, quotes: quotes, replies: replies, self_replies: self, snapshot_day: day };
}
// UTM-VISITS-1 (0.8.2): the utm_source values a learner channel's posts carry (POST-ID-UTM-1 and BUFFER_UTM_SOURCE).
var LEARNER_UTM_SOURCES = { bluesky: ['bluesky'], linkedin: ['linkedin'], mastodon: ['mastodon'], x: ['x', 'twitter'] };
async function learnerVisits(env, slug, d0, channel) {
  if (!slug) return { visits: null, status: 'no papers.qnfo.org link' };
  // UTM-VISITS-1 (0.8.2, lever T7.9 half 2): a tagged page load counted by qnfo-gateway 3.10.0 (reach_signals source utm,
  // metric clicks_human, entity campaign = the paper slug, channel = utm_source) is a direct measurement of the visits this
  // post caused. When the 72h window carries any such row for the post's channel, they are the visits; else the RUM lift below.
  try {
    const srcs = (channel && LEARNER_UTM_SOURCES[String(channel)]) || null;
    const u = await env.DB.prepare("SELECT SUM(CASE WHEN metric = 'clicks_human' THEN value ELSE 0 END) AS h, SUM(CASE WHEN metric = 'clicks_bot' THEN value ELSE 0 END) AS b, COUNT(*) AS n, MAX(date) AS d FROM reach_signals WHERE source = 'utm' AND entity_type = 'campaign' AND entity_id = ?1 AND date >= ?2 AND date <= ?3 AND (?4 IS NULL OR channel IN (?4, ?5))")
      .bind(String(slug), d0, learnerShiftDay(d0, 2), srcs ? srcs[0] : null, srcs ? (srcs[1] || srcs[0]) : null).first();
    if (u && Number(u.n) > 0) return { visits: Number(u.h) || 0, window_views: Number(u.h) || 0, bot_clicks: Number(u.b) || 0, status: 'ok', source: 'utm', channel: channel || 'all', last_day: String(u.d) };
  } catch (e) { /* no utm rows yet (the ledger starts with the first tagged load): the RUM lift below */ }
  // ATTENTION-LOOP-1 (0.8.0): the bot-filtered per-item rows (source cf-rum-human) when the three window days carry them,
  // else the unfiltered rows as before; the source is named in the status.
  const read = async function(source) {
    const r = await env.DB.prepare("SELECT date, MAX(CASE WHEN entity_type = 'site' THEN 1 ELSE 0 END) AS rd, SUM(CASE WHEN entity_type = 'paper' THEN value ELSE 0 END) AS v FROM reach_signals WHERE source = ?4 AND metric = 'pageviews' AND date >= ?2 AND date <= ?3 AND ((entity_type = 'site' AND entity_id = '(all)') OR (entity_type = 'paper' AND entity_id = ?1)) GROUP BY date").bind(String(slug), learnerShiftDay(d0, -7), learnerShiftDay(d0, 2), source).all();
    const by = {};
    for (const x of (r && r.results) || []) by[x.date] = { read: Number(x.rd) === 1, v: Number(x.v) || 0 };
    return by;
  };
  try {
    let source = 'cf-rum-human', by = await read(source);
    const windowRead = function(m) { for (let k = 0; k < 3; k++) { const d = m[learnerShiftDay(d0, k)]; if (!d || !d.read) return false; } return true; };
    if (!windowRead(by)) { source = 'cf-rum'; by = await read(source); }
    let win = 0;
    for (let k = 0; k < 3; k++) {
      const d = by[learnerShiftDay(d0, k)];
      if (!d || !d.read) return { visits: null, status: 'RUM day ' + learnerShiftDay(d0, k) + ' not ingested', source: source };
      win += d.v;
    }
    let bs = 0, bn = 0;
    for (let k = 1; k <= 7; k++) { const d = by[learnerShiftDay(d0, -k)]; if (d && d.read) { bs += d.v; bn++; } }
    if (bn < 3) return { visits: null, status: 'baseline has ' + bn + ' ingested days (needs 3)', window_views: win, source: source };
    const base = bs / bn;
    return { visits: Math.max(0, Math.round((win - 3 * base) * 100) / 100), window_views: win, baseline_daily: Math.round(base * 100) / 100, baseline_days: bn, status: 'ok', source: source };
  } catch (e) {
    return { visits: null, status: 'reach_signals unreadable: ' + String(e && e.message || e).slice(0, 100) };
  }
}
function learnerRewardOf(eng, visits) {
  const x = eng.e + (visits !== null && visits !== undefined ? visits / LEARNER_VISITS_PER_ENGAGEMENT : 0);
  return { x: lr4(x), reward: lr4(1 - Math.exp(-x / LEARNER_REWARD_SCALE)) };
}

// ---- weekly update ----
// Files every Bluesky post since the epoch that has no learner row yet (posts the learner did not choose teach it too).
async function learnerDiscover(env, nowMs) {
  const iso = new Date(nowMs || Date.now()).toISOString();
  const ins = "INSERT OR IGNORE INTO social_learner_posts (post_key, slug, bsky_uri, link_slug, topic, format, slot, n_posts, posted_at, chosen_by, status, created_at, channel) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'scheduler', ?10, ?11, 'bluesky')";
  const stmts = [];
  const add = function(key, arms, uri, postedAt) {
    const ms = learnerParseTs(postedAt);
    if (!uri || !isFinite(ms)) return;
    stmts.push(env.DB.prepare(ins).bind(key, arms.slug || null, uri, arms.link_slug || null, arms.topic || null, arms.format || null, learnerSlotOf(ms), Number(arms.n_posts) || 1, new Date(ms).toISOString(), arms.topic ? 'pending' : 'not-arm', iso));
  };
  const a = await env.DB.prepare("SELECT id, slug, title, doi, posts, post_uri, posted_at FROM social_threads WHERE status = 'posted' AND post_uri IS NOT NULL AND post_uri <> '' AND posted_at >= ?1 AND NOT EXISTS (SELECT 1 FROM social_learner_posts l WHERE l.post_key = 'thread:' || social_threads.id) ORDER BY posted_at ASC LIMIT 200").bind(LEARNER_EPOCH_SQL).all();
  for (const r of (a && a.results) || []) add('thread:' + r.id, learnerClassify(r, 'thread'), blueskyUriOf(r.post_uri), r.posted_at);
  const b = await env.DB.prepare("SELECT id, paper_slug, paper_doi, paper_title, pages_url, post_id, posted_at FROM dissemination_tracker WHERE action = 'posted' AND channel = 'bluesky' AND post_id LIKE 'at://%' AND posted_at >= ?1 AND NOT EXISTS (SELECT 1 FROM social_learner_posts l WHERE l.post_key = 'dissem:' || dissemination_tracker.id) ORDER BY posted_at ASC LIMIT 200").bind(LEARNER_EPOCH_SQL).all();
  for (const r of (b && b.results) || []) add('dissem:' + r.id, learnerClassify(r, 'dissem'), blueskyUriOf(r.post_id), r.posted_at);
  // LEARNER-CHANNEL-ARM-1: the Buffer channel posts the drain recorded teach the channel arm. Arms come from the thread row
  // the slug names (topic, format, link), the slot from the publish time; the engagement is read at credit time from the
  // reach ledger's buffer rows (reach_signals source buffer, per channel post).
  try {
    const c = await env.DB.prepare("SELECT p.id, p.platform, p.buffer_id, p.project_id, p.published_at, t.id AS thread_id, t.slug, t.title, t.doi, t.posts FROM social_media_posts p LEFT JOIN social_threads t ON t.slug = p.project_id WHERE p.platform LIKE 'buffer-%' AND p.status NOT IN ('failed', 'error') AND p.buffer_id IS NOT NULL AND p.published_at >= ?1 AND NOT EXISTS (SELECT 1 FROM social_learner_posts l WHERE l.post_key = 'channel:' || p.id) ORDER BY p.published_at ASC LIMIT 200").bind(LEARNER_EPOCH_SQL).all();
    for (const r of (c && c.results) || []) {
      const ch = LEARNER_CHANNEL_OF[String(r.platform)] || null;
      const ms = learnerParseTs(r.published_at);
      if (!ch || !isFinite(ms)) continue;
      const arms = r.thread_id ? learnerClassify({ slug: r.slug, title: r.title, doi: r.doi, posts: r.posts }, 'thread') : { topic: null, format: 'single', n_posts: 1, link_slug: null, slug: String(r.project_id || '') };
      stmts.push(env.DB.prepare("INSERT OR IGNORE INTO social_learner_posts (post_key, slug, bsky_uri, link_slug, topic, format, slot, n_posts, posted_at, chosen_by, status, created_at, channel, buffer_id) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, 1, ?7, 'channel-drain', ?8, ?9, ?10, ?11)")
        .bind('channel:' + r.id, arms.slug || String(r.project_id || ''), arms.link_slug || null, arms.topic || null, arms.format || null, learnerSlotOf(ms), new Date(ms).toISOString(), arms.topic ? 'pending' : 'not-arm', iso, ch, String(r.buffer_id)));
    }
  } catch (e) { console.log('LEARNER-CHANNEL-ARM-1 discover failed: ' + String(e && e.message || e).slice(0, 160)); }
  if (stmts.length) await env.DB.batch(stmts);
  return stmts.length;
}
// LEARNER-CHANNEL-ARM-1: a channel post's engagement from the reach ledger's buffer rows inside its window (counts are
// cumulative, so the maximum per metric is the last snapshot); null when no row has landed yet.
async function learnerChannelEngagement(env, bufferId, w) {
  if (!bufferId) return null;
  const r = await env.DB.prepare("SELECT metric, MAX(value) AS v, MAX(date) AS d FROM reach_signals WHERE source = 'buffer' AND entity_type = 'post' AND entity_id = ?1 AND date >= ?2 AND date <= ?3 GROUP BY metric").bind(String(bufferId), w.from, w.to).all();
  const rows = (r && r.results) || [];
  if (!rows.length) return null;
  const m = {};
  let day = null;
  for (const x of rows) { m[String(x.metric)] = Number(x.v) || 0; if (!day || String(x.d) > day) day = String(x.d); }
  let e = 0;
  for (const k of LEARNER_BUFFER_ENGAGEMENT) e += m[k] || 0;
  return { e: e, likes: m.reactions || 0, reposts: m.reposts || 0, quotes: m.quotes || 0, replies: m.comments || 0, self_replies: 0, impressions: m.impressions || m.views || m.reach || 0, snapshot_day: day };
}
// LEARNER-CHANNEL-ARM-1: the order the channel drain visits the Buffer channels: one Beta draw per channel arm, highest
// first (a tie keeps CHANNEL_ORDER); the learner off or unreadable keeps CHANNEL_ORDER. Drain keys (twitter for x).
async function learnerChannelOrder(env, rng) {
  const base = CHANNEL_ORDER.slice();
  try {
    const lrn = await learnerEnabled(env);
    if (!lrn.on) return { order: base, via: 'learner-off' };
    await ensureLearnerSchema(env);
    const post = await learnerPosterior(env);
    const draws = {};
    for (const c of base) { const k = LEARNER_CHANNEL_OF[c] || c; const arm = post.channel && post.channel[k]; draws[c] = arm ? lr4(learnerBeta(arm.a, arm.b, rng || learnerRng)) : 0.5; }
    const order = base.map(function(c, i) { return { c: c, i: i, v: draws[c] }; }).sort(function(a, b) { return b.v - a.v || a.i - b.i; }).map(function(x) { return x.c; });
    return { order: order, draws: draws, via: 'learner' };
  } catch (e) { return { order: base, via: 'error: ' + String(e && e.message || e).slice(0, 80) }; }
}
async function learnerCount(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM social_learner_posts").first();
  return Number((r && r.n) || 0);
}
async function learnerWeeklyUpdate(env, nowMs) {
  const now = nowMs || Date.now();
  const iso = new Date(now).toISOString();
  await ensureLearnerSchema(env);
  const before = await learnerCount(env);
  await learnerDiscover(env, now);
  const out = { version: VERSION, epoch: LEARNER_EPOCH_SQL, discovered: (await learnerCount(env)) - before, credited: 0, no_data: 0, waiting: 0, rewards: [] };
  await learnerCreditPending(env, now, out);
  const post = await learnerPosterior(env);
  const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM social_learner_posts WHERE status = 'pending'").first();
  out.pending = Number((left && left.n) || 0);
  out.rewards = out.rewards.slice(0, 10);
  out.posterior = learnerPosteriorSummary(post);
  out.next_week_allocation = learnerPBest(post, LEARNER_PBEST_DRAWS, learnerRng);
  return out;
}
// ATTENTION-LOOP-1 (0.8.0): the credit step on its own, so it runs daily (learnerDailyCredit) as well as inside the weekly
// update. A post is credited once (UPDATE ... WHERE status = 'pending'), whichever tick reaches it first.
async function learnerCreditPending(env, now, out) {
  const iso = new Date(now).toISOString();
  const pend = await env.DB.prepare("SELECT post_key, slug, bsky_uri, link_slug, topic, format, slot, n_posts, posted_at, chosen_by, channel, buffer_id FROM social_learner_posts WHERE status = 'pending' ORDER BY posted_at ASC LIMIT 60").all();
  for (const p of (pend && pend.results) || []) {
    const t0 = learnerParseTs(p.posted_at);
    if (!isFinite(t0)) continue;
    const w = learnerWindow(t0);
    if (now < w.end + LEARNER_CREDIT_GRACE_MS) { out.waiting++; continue; }
    const ch = p.channel || 'bluesky';
    const arms = { topic: p.topic, format: p.format, slot: p.slot, channel: ch };
    let eng;
    if (ch === 'bluesky') {
      const snaps = p.bsky_uri ? (await learnerSnapshots(env, [{ uri: String(p.bsky_uri), ms: t0 }]))[String(p.bsky_uri)] : [];
      eng = learnerEngagementOf(snaps, p.n_posts);
    } else {
      // LEARNER-CHANNEL-ARM-1: Buffer reports a post's metrics about a day late, so a closed window waits one more day.
      eng = await learnerChannelEngagement(env, p.buffer_id, w);
      if (!eng && now < w.end + LEARNER_CHANNEL_GRACE_MS) { out.waiting++; continue; }
    }
    if (!eng) {
      // Snapshots are written for the collection day only, so a closed window with none will never get one: final.
      const detail = { window: [w.from, w.to], reason: (ch === 'bluesky' ? 'no social_engagements snapshot' : 'no reach_signals buffer row for ' + ch) + ' inside the 72h window; posterior unchanged' };
      const u = await env.DB.prepare("UPDATE social_learner_posts SET status = 'no-data', reward_detail = ?2, credited_at = ?3 WHERE post_key = ?1 AND status = 'pending'").bind(p.post_key, JSON.stringify(detail), iso).run();
      if (learnerChanges(u) === 0) continue;
      out.no_data++;
      await learnerLogEvent(env, 'social-learner-reward-' + p.post_key, 'social-learner-reward', 'no-data', 'qnfo-social learner: ' + p.post_key + ' has no engagement snapshot inside its 72h window; no update', { post_key: p.post_key, arms: arms, detail: detail }, now);
      continue;
    }
    const vis = await learnerVisits(env, p.link_slug, w.from, ch);
    const rw = learnerRewardOf(eng, vis.visits);
    const detail = { engagement: eng, visits: vis, x: rw.x, reward: rw.reward, window: [w.from, w.to], chosen_by: p.chosen_by };
    const u = await env.DB.prepare("UPDATE social_learner_posts SET status = 'credited', engagement = ?2, visits = ?3, reward = ?4, reward_detail = ?5, credited_at = ?6 WHERE post_key = ?1 AND status = 'pending'").bind(p.post_key, eng.e, vis.visits, rw.reward, JSON.stringify(detail), iso).run();
    if (learnerChanges(u) === 0) continue;
    out.credited++;
    out.rewards.push({ post: p.post_key, topic: p.topic, format: p.format, slot: p.slot, e: eng.e, v: vis.visits, r: rw.reward });
    await learnerLogEvent(env, 'social-learner-reward-' + p.post_key, 'social-learner-reward', 'credited',
      'qnfo-social learner: ' + p.post_key + ' (' + p.topic + ', ' + p.format + ', ' + (p.slot || 'no slot') + ') e=' + eng.e + ' v=' + vis.visits + ' reward ' + rw.reward,
      { post_key: p.post_key, arms: arms, update: { alpha_plus: rw.reward, beta_plus: lr4(1 - rw.reward) }, detail: detail }, now);
  }
  return out;
}
// Daily, 07:00Z after the engagement collector: file new posts and credit every pending post whose 72h window closed, so the
// posterior that chooses tomorrow's post carries this week's rewards (the weekly update alone credited 7+ days late; on
// 2026-10-06 the two learner rows of 10-02 and 10-03 still read pending). Records social-learner-credit-<day>.
async function learnerDailyCredit(env, nowMs) {
  const now = nowMs || Date.now();
  const lrn = await learnerEnabled(env);
  if (!lrn.on) return { disabled: true, reason: lrn.reason };
  await ensureLearnerSchema(env);
  const before = await learnerCount(env);
  await learnerDiscover(env, now);
  const out = { version: VERSION, discovered: (await learnerCount(env)) - before, credited: 0, no_data: 0, waiting: 0, rewards: [] };
  await learnerCreditPending(env, now, out);
  const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM social_learner_posts WHERE status = 'pending'").first();
  out.pending = Number((left && left.n) || 0);
  out.rewards = out.rewards.slice(0, 10);
  await recordSocialRun(env, 'learner-credit', 'ok', out, now);
  return out;
}
// Mondays, or any later day once the last completed update is 7+ days old. Records social-learner-update-<day>.
async function learnerWeeklyTick(env, nowMs) {
  const now = nowMs || Date.now();
  let last = null;
  try {
    const r = await env.DB.prepare("SELECT MAX(json_extract(meta, '$.last_ok')) AS last FROM cloud_ops_events WHERE id >= 'social-learner-update-' AND id < 'social-learner-update.'").first();
    last = r && r.last ? String(r.last) : null;
  } catch (e) {}
  const lastMs = last ? Date.parse(last) : NaN;
  const due = new Date(now).getUTCDay() === 1 || !isFinite(lastMs) || now - lastMs >= 7 * 864e5 - 36e5;
  if (!due) return { not_due: true, last_ok: last };
  const lrn = await learnerEnabled(env);
  if (!lrn.on) {
    const res = { disabled: true, reason: lrn.reason };
    await recordSocialRun(env, 'learner-update', 'skipped', res, now);
    return res;
  }
  let res;
  try { res = await learnerWeeklyUpdate(env, now); } catch (e) { res = { error: String(e && e.message || e).slice(0, 200) }; }
  await recordSocialRun(env, 'learner-update', res.error ? 'error' : 'ok', res, now);
  return res;
}

// ---- metric_registry social_engagement_rate_30d (daily, 07:00Z) ----
// Engagements per Bluesky post: Bluesky reports no impressions, so the STRATEGY 6.3 "engagement rate" is read per post.
// Every Bluesky post counts (not only arm posts), from the learner epoch on: the September q08 flood before it is a
// different channel that no remedy can move now. A post without a snapshot inside its window is left out (a missing
// measurement is not a zero), and with none the value is 'n/a: ...', which v_metric_trigger_state reads as unreadable,
// never 0. The row is created only if absent (migrations/2026-10-02-social-distribution-learner.sql inserts the same
// definition and its METRIC-CLOSED-LOOP-1 trigger), and the value is written only while qnfo-social owns the row, so a
// definition another change registers centrally is never overwritten. metric_history (qnfo-fleet-control
// IMPROVEMENT-LOOP-1) then keeps its daily trend and judges regressions like any other metric.
var LEARNER_METRIC_DEF = {
  formula: "mean, over Bluesky posts (social_threads + dissemination_tracker) posted since 2026-10-02 and in the 30 days ending 74h ago that have a social_engagements snapshot inside their first 72h, of likes + reposts + quotes + replies from others (a thread's own first reply subtracted) at the last daily snapshot within 72h of posting; engagements per post, since Bluesky reports no impressions",
  source: "qnfo-audit.social_engagements x social_threads.post_uri / dissemination_tracker.post_id (qnfo-social SOCIAL-DISTRIBUTION-LEARNER-1, GET https://qnfo-social.q08.workers.dev/learner)",
  baseline: "about 0.1 (2026-10-01 audit: 1 reaction across the last 10 posts); reset from the first full week of 72h-window data (STRATEGY 6.3)",
  target: ">= 0.2 engagements per post, then x2 on the first-week baseline by 2026-12-31 (STRATEGY 9); never by volume or paid attention",
  actor: "qnfo-social distribution learner: Thompson sampling over topic, format and time slot inside the cadence caps (STRATEGY 6.4)",
  warning: "< 0.2", kill: "< 0.05"
};
async function learnerEngagementRate(env, nowMs) {
  const now = nowMs || Date.now();
  const to = learnerSqlTs(now - LEARNER_WINDOW_MS - LEARNER_CREDIT_GRACE_MS);
  let from = learnerSqlTs(now - LEARNER_WINDOW_MS - LEARNER_CREDIT_GRACE_MS - 30 * 864e5);
  if (from < LEARNER_EPOCH_SQL) from = LEARNER_EPOCH_SQL;
  const posts = [], seen = {};
  const add = function(uri, postedAt, n) {
    const ms = learnerParseTs(postedAt);
    if (uri && !seen[uri] && isFinite(ms)) { seen[uri] = 1; posts.push({ uri: uri, ms: ms, n: n }); }
  };
  const a = await env.DB.prepare("SELECT posts, post_uri, posted_at FROM social_threads WHERE status = 'posted' AND post_uri IS NOT NULL AND post_uri <> '' AND posted_at >= ?1 AND posted_at <= ?2 ORDER BY posted_at DESC LIMIT 300").bind(from, to).all();
  for (const r of (a && a.results) || []) add(blueskyUriOf(r.post_uri), r.posted_at, learnerPostsOf(r.posts).length);
  const b = await env.DB.prepare("SELECT post_id, posted_at FROM dissemination_tracker WHERE action = 'posted' AND channel = 'bluesky' AND post_id LIKE 'at://%' AND posted_at >= ?1 AND posted_at <= ?2 ORDER BY posted_at DESC LIMIT 300").bind(from, to).all();
  for (const r of (b && b.results) || []) add(blueskyUriOf(r.post_id), r.posted_at, 1);
  let withData = 0, sum = 0;
  const snaps = await learnerSnapshots(env, posts);
  for (const p of posts) {
    const eng = learnerEngagementOf(snaps[p.uri], p.n);
    if (eng) { withData++; sum += eng.e; }
  }
  const rate = withData ? Math.round(sum / withData * 1000) / 1000 : null;
  const value = rate === null ? 'n/a: no Bluesky post since 2026-10-02 has a closed 72h window with an engagement snapshot yet' : String(rate);
  return { posts: posts.length, with_data: withData, engagements: sum, rate: rate, window: [from, to], registry: await learnerWriteMetric(env, value, now) };
}
async function learnerWriteMetric(env, value, nowMs) {
  const D = LEARNER_METRIC_DEF;
  try {
    await env.DB.prepare("INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES (?1, 'fleet', 'leading', ?2, ?3, ?4, ?5, 'qnfo-social', ?6, 'daily', ?7, ?8, 'MEASURED', 'computed')")
      .bind(LEARNER_METRIC, D.formula, D.source, D.baseline, D.target, D.actor, D.warning, D.kill).run();
    const u = await env.DB.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3 WHERE metric = ?1 AND COALESCE(owner, 'qnfo-social') = 'qnfo-social'").bind(LEARNER_METRIC, value, new Date(nowMs || Date.now()).toISOString()).run();
    if (learnerChanges(u) === 0) {
      const o = await env.DB.prepare("SELECT owner FROM metric_registry WHERE metric = ?1").bind(LEARNER_METRIC).first();
      return { written: false, reason: o ? 'row owned by ' + String(o.owner || '?') + '; its owner refreshes it' : 'row absent after insert' };
    }
    return { written: true, value: value };
  } catch (e) {
    return { written: false, error: String(e && e.message || e).slice(0, 160) };
  }
}

// ---- public read (OPEN-ACCESS-1): GET /learner ----
// GET /learner is public (OPEN-ACCESS-1): a failed read says which part is unavailable, never the exception text (CodeQL
// js/stack-trace-exposure); the detail goes to the worker log.
function learnerPublicError(part, e) {
  console.error('SOCIAL-DISTRIBUTION-LEARNER-1 /learner ' + part + ' read failed', e);
  return part + ' unavailable';
}
async function learnerReport(env) {
  const lrn = await learnerEnabled(env);
  const out = { worker: 'qnfo-social', version: VERSION, learner: 'SOCIAL-DISTRIBUTION-LEARNER-1', enabled: lrn.on, switch: /^switch unreadable/.test(String(lrn.reason || '')) ? 'switch unreadable, old order' : lrn.reason,
    arms: { topic: LEARNER_TOPICS, format: LEARNER_FORMATS, slot_utc_hours: LEARNER_SLOTS },
    reward: 'r = 1 - exp(-(e + v/' + LEARNER_VISITS_PER_ENGAGEMENT + ')/' + LEARNER_REWARD_SCALE + '); e = 72h Bluesky likes + reposts + quotes + replies from others; v = attributed papers.qnfo.org paper views over baseline (CF RUM), when ingested; credited once per post',
    limits: ['chooses only among queued posts, inside the weekly cap, pause flag and content gates; never posts more', 'learner posts at least 24h apart'] };
  // Read-only: before the first learner run (no table yet) the posterior is the prior.
  let post;
  try { post = await learnerPosterior(env); } catch (e) {
    if (/no such table/i.test(String(e && e.message || e))) { post = learnerPrior(); out.note = 'no learner rows yet: the posterior is the Beta(1,1) prior'; }
    else out.posterior_error = learnerPublicError('posterior', e);
  }
  if (post) { out.posterior = learnerPosteriorSummary(post); out.next_week_allocation = learnerPBest(post, 1000, learnerRng); }
  try { const st = await learnerState(env); out.pending = learnerBrief(st.decision); out.last_post_at = st.last_post_at || null; } catch (e) { out.pending_error = learnerPublicError('pending', e); }
  try {
    const r = await env.DB.prepare("SELECT post_key, slug, topic, format, slot, posted_at, chosen_by, status, engagement, visits, reward, credited_at FROM social_learner_posts ORDER BY posted_at DESC LIMIT 20").all();
    out.recent = (r && r.results) || [];
  } catch (e) {
    if (/no such table/i.test(String(e && e.message || e))) out.recent = [];
    else out.recent_error = learnerPublicError('recent', e);
  }
  return out;
}

// CARD-RELEASE-1 (0.7.32, 2026-10-02, pillar reach): a post that waits for the owner is a social_threads row in status
// 'draft' whose notes are exactly 'await-card:<human_actions slug>'. Marking that card done on fleet.qnfo.org (the card's
// status becomes 'resolved') queues the post as a selected post, inside every gate and cap as usual; dismissing the card
// sets the post to 'rejected'. Nothing else releases it: recheckDrafts only touches checker-unavailable drafts.
async function releaseCardApproved(env) {
  const rows = await env.DB.prepare("SELECT t.id, substr(t.notes, 12) AS card_slug, h.status AS card FROM social_threads t JOIN human_actions h ON h.slug = substr(t.notes, 12) WHERE t.status = 'draft' AND t.notes LIKE 'await-card:%' AND h.status IN ('resolved', 'dismissed')").all();
  let queued = 0, rejected = 0;
  for (const r of rows.results || []) {
    if (r.card === 'resolved') {
      await env.DB.prepare("UPDATE social_threads SET status='queued', flags='selected', notes=?, updated_at=datetime('now') WHERE id=? AND status='draft'").bind('selected: released by owner card ' + r.card_slug, r.id).run();
      queued++;
    } else {
      await env.DB.prepare("UPDATE social_threads SET status='rejected', notes=?, updated_at=datetime('now') WHERE id=? AND status='draft'").bind('rejected: owner dismissed card ' + r.card_slug, r.id).run();
      rejected++;
    }
  }
  return { queued, rejected };
}

export default {
  async scheduled(event, env) {
    // SOCIAL-RUN-LEDGER-1: every operation below records its run with recordSocialRun (defined after drainQueue).
    if (event.cron === '0 6 * * *') {
      const sc = await autoScan(env);
      await recordSocialRun(env, 'scan', sc && !sc.error ? 'ok' : 'error', sc || { error: 'no result' });
      return;
    }
    if (event.cron === '0 7 * * *') {
      await alertDigest(env);
      let eo;
      try { eo = await collectEngagement(env); } catch (e) { eo = { error: String(e && e.message || e).slice(0, 200) }; await logAlert(env, 'engagement', 'error', 'SOCIAL-ENGAGEMENT-SELF-1 ' + String(e).slice(0, 300)); }
      // SOCIAL-DISTRIBUTION-LEARNER-1: the 30-day engagement rate from the snapshots just taken (measurement only, never
      // switched off), then the learner's weekly update (Mondays, or catch-up), which records its own ledger row.
      try { eo.rate_30d = await learnerEngagementRate(env); } catch (e) { eo.rate_30d = { error: String(e && e.message || e).slice(0, 160) }; }
      await recordSocialRun(env, 'engagement', engagementRunStatus(eo), eo);
      // ATTENTION-LOOP-1 (0.8.0): credit closed windows every day, then the weekly allocation when due.
      try { await learnerDailyCredit(env); } catch (e) { console.log('ATTENTION-LOOP-1 daily credit threw: ' + String(e && e.message || e).slice(0, 200)); }
      try { await learnerWeeklyTick(env); } catch (e) { console.log('SOCIAL-DISTRIBUTION-LEARNER-1 weekly tick threw: ' + String(e && e.message || e).slice(0, 200)); }
      return;
    }
    try { await bufferChannelAudit(env); } catch (e) { await logAlert(env, 'buffer-channels', 'error', 'BUFFER-CHANNEL-AUDIT-1 ' + String(e).slice(0, 300)); }
    let ps;
    try {
      ps = await syncProfile(env);
      if (ps && (ps.updated || ps.error || ps.held)) console.log('[qnfo-social] profile-sync', JSON.stringify(ps));
    } catch (e) { ps = { error: 'threw: ' + String(e && e.message || e).slice(0, 200) }; console.log('[qnfo-social] profile-sync threw', ps.error); }
    await recordSocialRun(env, 'profile-sync', profileRunStatus(ps), ps);
    try { await recheckDrafts(env); } catch (e) { console.log('[qnfo-social] recheck threw', String(e && e.message || e).slice(0, 200)); }
    let cr;
    try { cr = await releaseCardApproved(env); } catch (e) { cr = { error: String(e && e.message || e).slice(0, 200) }; }
    // Each drain is isolated: a throw in one used to end the tick before the other drain and the link checks ran.
    let q, d;
    try { q = await drainQueue(env); } catch (e) { q = { error: String(e && e.message || e).slice(0, 200) }; }
    try { d = await drainDissemination(env); } catch (e) { d = { error: String(e && e.message || e).slice(0, 200) }; }
    await recordSocialRun(env, 'drain', drainRunStatus(q, d), { queue: q, dissemination: d, card_release: cr });
    // DAILY-DISTRIBUTION-1: after the Bluesky drains (and their cross-posts), fill the room each Buffer channel still has.
    let ch;
    try { ch = await drainChannels(env); } catch (e) { ch = { error: String(e && e.message || e).slice(0, 200) }; }
    await recordSocialRun(env, 'channels', channelsRunStatus(ch), ch);
    await retractDeadLinks(env);
    await restoreMisdeleted(env);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname, m = request.method;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Ops-Key' };
    if (m === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (p === '/health') return new Response(JSON.stringify({ ok: true, worker: 'qnfo-social', version: VERSION, capabilities: ["bluesky-posting", "linkedin-via-buffer", "dissemination-drain", "engagement-collection", "profile-sync", "buffer-channel-audit", "distribution-learner", "channel-drain", "attention-share"], limitations: ["every route except /health and GET /learner needs the social token", "posting, the dissemination drain, profile sync and the audits run only on its crons (every 2 hours at :30, 06:00 and 07:00)", "LinkedIn is reached only through the Buffer queue, never LinkedIn's API; pipeline_flags.linkedin_mode 'draft' keeps those posts as drafts", "the channel drain posts to LinkedIn, Mastodon and X inside their own weekly caps (3, 2, 2; pipeline_flags.social_channel_caps) spread over the week, never the same slug twice in 30 days on one channel; Bluesky keeps its own cap", "the profile sync never overwrites a bio the owner edited", "the distribution learner only chooses which queued post goes next and in which slot, inside the weekly cap and content gates; ops_config social_learner_enabled=0 turns it off", "ATTENTION-SHARE-1: ops_config attention_channel_share (qnfo-fleet-dashboard scorecard, daily) scales each channel cap down to its attention share, never above the owner cap; a share older than 3 days reads as 1", "UTM-VISITS-1: a learner post's visits are the gateway's tagged loads for its slug and channel (reach_signals source utm, clicks_human) when its window has any, else the bot-filtered RUM lift", "LEARNER-CHANNEL-ARM-1: the learner's channel arm only orders the Buffer channels and reports an allocation; it never changes a cap or a share"], handle: env.BSKY_HANDLE }), { headers: { 'Content-Type': 'application/json', ...cors } });
    // SOCIAL-DISTRIBUTION-LEARNER-1 (OPEN-ACCESS-1): the learner's posterior, next decision and recent rewards, read-only.
    if (p === '/learner' && m === 'GET') {
      let body;
      try { body = await learnerReport(env); } catch (e) { console.error('learner report failed', e); body = { error: 'learner report unavailable' }; }
      return new Response(JSON.stringify(body), { status: body.error ? 500 : 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...cors } });
    }
    if (!auth(request, env)) return new Response('unauthorized', { status: 401, headers: cors });
    try {
      if (p === '/drain-dissemination') {
        const r = await drainDissemination(env);
        return new Response(JSON.stringify({ ok: true, ...r }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      const json = function(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', ...cors } }); };
      if (p === '/engagement' && m === 'POST') {
        return json({ ok: true, engagement: await collectEngagement(env) });
      }
      if (p === '/post' && m === 'POST') {
        const b = await request.json();
        const g = await routeGate(env, '/post', [String(b.text || '')]);
        if (g.status) return json(g.body, g.status);
        const s = await session(env);
        const r = await postText(s, g.texts[0], null, { campaign: b.slug ? String(b.slug) : undefined });
        const slug = await recordAdhoc(env, 'post', b.title || g.texts[0].slice(0, 120), typeof r.stored_text === 'string' && r.stored_text ? [r.stored_text] : (typeof r.text === 'string' && r.text ? [r.text] : g.texts), r.uri);
        return json({ ok: true, uri: r.uri, slug: slug });
      }
      if (p === '/cross' && m === 'POST') {
        const b = await request.json();
        const link = String(b.link || '');
        const g = await routeGate(env, '/cross', [String(b.text || ''), link]);
        if (g.status) return json(g.body, g.status);
        const bufText = link ? applyLink(g.texts[0], link, 280) : truncate(g.texts[0], 280);
        const res = await bufferPost(env, bufText, b.slug ? String(b.slug) : undefined);
        const uriVal = postUriValue(null, res);
        // POST-SENT-TEXT-1: record the first channel's text as Buffer received it (tagged), not the untagged draft.
        const sentBuf = ((res && res.results) || []).filter(function(x) { return x && x.post_id && typeof x.text === 'string' && x.text; }).map(function(x) { return x.text; })[0];
        const slug = uriVal ? await recordAdhoc(env, 'cross', b.title || bufText.slice(0, 120), [sentBuf || bufText], uriVal) : null;
        return json({ ok: true, buffer: res, text_sent: bufText, post_uri: uriVal, slug: slug });
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
        const g = await routeGate(env, '/thread', posts);
        if (g.status) return json(g.body, g.status);
        const s = await session(env);
        const sent = [];
        const uris = await postThread(s, g.texts, { campaign: b.slug ? String(b.slug) : undefined, sent: sent });
        const slug = await recordAdhoc(env, 'thread', b.title || g.texts[0].slice(0, 120), sentPostsJson(sent) ? sent : g.texts, uris[0]);
        return new Response(JSON.stringify({ ok: true, root: uris[0], count: uris.length, uris: uris, slug: slug }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/threads' && m === 'GET') {
        await ensureSocialSchema(env);
        const rows = await env.DB.prepare("SELECT id, slug, title, status, error, retry_count, posted_at, created_at, post_uri FROM social_threads ORDER BY id DESC LIMIT 50").all();
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
        const prompt = composePrompt(doi, title, abstract);
        const ai = await aiRunAttr(env, "qnfo-social", "compose-2", COMPOSE_MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 2000 });
        const text = extractText(ai);
        const posts = sanitizePosts(text.split("\n"));
        if (posts.length < 3) return new Response(JSON.stringify({ error: 'compose produced too few posts', raw: text.slice(0, 500) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
        const slug = String(b.slug || ('draft-' + Date.now().toString(36)));
        const issues = await checkThread(env, title, abstract, posts, doi);
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
        const g = await routeGate(env, '/broadcast', posts);
        if (g.status) return json(g.body, g.status);
        const s = await session(env);
        const sent = [];
        const uris = await postThread(s, g.texts, { campaign: row.slug ? String(row.slug) : undefined, sent: sent });
        await markPosted(env, row.id, postUriValue(uris[0], null), sent);
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
        // Remediation recreates posts that already existed, so the weekly cap does not apply; the pause flag and the
        // content gate do. A thread that fails the content gate is left untouched (its old posts are not deleted).
        const g0 = await routeGate(env, '/repost', [], { skipCap: true });
        if (g0.status) return json(g0.body, g0.status);
        const s = await session(env);
        const results = [];
        for (const th of threads) {
          try {
            const cg = contentGate(((th && th.posts) || []).concat([String((th && th.link) || ''), String((th && th.title) || '')]));
            if (!cg.ok) { results.push({ slug: th && th.slug, skipped: 'content gate: ' + cg.reason }); continue; }
            const r = await repostThread(s, th);
            if (th.slug && r.newRoot) { try { await recordPostUriBySlug(env, String(th.slug), r.newRoot); } catch (eU) {} }
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
  var t0 = Date.now(), ok = 1, res;
  try { res = await env.AI.run(model, input, opts); return res; } catch (e) { ok = 0; throw e; }
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
          if (res && !/(?:bge|embed|whisper|m2m100|resnet|flux|sdxl)/i.test(String(model))) {
            var u = (res && res.usage) || {};
            var cached = (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || u.cached_tokens || (u.input_tokens_details && u.input_tokens_details.cached_tokens) || 0;
            var in_tok = u.prompt_tokens || u.input_tokens || 0;
            await db.prepare("CREATE TABLE IF NOT EXISTS ai_cache_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, in_tok INTEGER DEFAULT 0, cached INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model))").run();
            await db.prepare("INSERT INTO ai_cache_counters (day, worker, purpose, model, in_tok, cached) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(day, worker, purpose, model) DO UPDATE SET in_tok=in_tok+?5, cached=cached+?6").bind(day, worker, purpose, String(model), in_tok, cached).run();
          }
        })();
        wr.catch(function() {});
      }
    } catch (e3) {}
  }
}
// end aiRunAttr
export { buildFacets, truncateSafe, applyLink, findDoi, byteLen, extractUrls, utmHost, sentPostsJson, utmTag, utmTagText,fitKeepUrls, tagAndFit, tagFacets, postText, postUriValue, weeklyCap, socialGate, drainQueue, drainDissemination, repairMojibake, contentGate, markPosted, routeGate, collectEngagement, blueskyUriOf, bufferPost, syncProfile, PROFILE_DESCRIPTION, bufferChannelAudit, linkedinMode, recordSocialRun, profileRunStatus, drainRunStatus, engagementRunStatus, autoScan,
  drainChannels, channelsRunStatus, channelText, channelCaps, channelWindow, channelCarried, pickChannelRow, CHANNEL_WEEKLY_CAP, CHANNEL_PLATFORM, CHANNEL_MAX_CHARS, CHANNEL_REPEAT_DAYS, SUBSCRIBE_LINE,
  learnerClassify, learnerIsQuestion, learnerTopicOf, learnerSlotOf, learnerBeta, learnerPrior, learnerPosterior, learnerChoose, learnerPBest,
  learnerEnabled, learnerPick, learnerEngagementOf, learnerVisits, learnerRewardOf, learnerWeeklyUpdate, learnerWeeklyTick, learnerCreditPending, learnerDailyCredit, attentionShares, shareCap, attentionOrder, learnerChannelOrder, learnerChannelEngagement, LEARNER_CHANNELS, LEARNER_CHANNEL_OF,
  learnerEngagementRate, learnerReport, ensureLearnerSchema, setLearnerRng, LEARNER_SLOTS, LEARNER_METRIC, LEARNER_METRIC_DEF , pickPaperRow, PAPER_PROMOTE_DAYS };
