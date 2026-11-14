// _shared/org-discovery.js: ORG-OUTREACH-1 producer. "Figuring out who your audience is": the employers the job search already found (jobsearch_matches) are
// organisations that exist, hire for work like Rowan's and have a public site. This module turns a company name into an org_targets row that _shared/org-outreach.js can
// judge: it finds and VERIFIES the organisation's own site (the page must name the company), reads a public contact address from that site only, and quotes the
// organisation's own description of its work as the one specific reason. Nothing is guessed into a row: no verified site, no address on the site's own domain or no
// quotable description means the row stays out of the queue.
// Pure ESM, no imports, no I/O (the worker passes fetched text in), so the worker inlines it and tests import it directly.

export const DISCOVERY_VERSION = "1.0.0";
export const USER_AGENT = "QNFO-research-bot (+https://qnfo.org)";
export const MAX_ATTEMPTS = 3;
export const PAGES = ["/", "/about", "/contact"];

// Hosts that are job boards or applicant systems, never the organisation's own site.
const ATS_HOST = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|myworkdayjobs\.com|workday\.com|smartrecruiters\.com|linkedin\.com|indeed\.com|breezy\.hr|bamboohr\.com|icims\.com|recruitee\.com|teamtailor\.com|join\.com|wellfound\.com|angel\.co|glassdoor\.com|ziprecruiter\.com|usajobs\.gov|idealist\.org|jobvite\.com|rippling\.com|paylocity\.com|adp\.com|oraclecloud\.com|taleo\.net|successfactors\.com|dayforcehcm\.com|applytojob\.com|jobs\.ch|welcometothejungle\.com|builtin\.com|otta\.com|ycombinator\.com)$/i;
const LEGAL = /\b(inc|llc|ltd|limited|corp|corporation|gmbh|co|company|plc|the|pbc|ag|sa|bv)\b\.?/g;

export function normName(s) {
  return String(s || "").toLowerCase().replace(/&/g, " and ").replace(LEGAL, " ").replace(/[^a-z0-9]+/g, "").slice(0, 40);
}

// SEGMENT from the organisation's name and the posting title: a name that says what it is wins; otherwise the default is an AI firm only when the text says AI.
export function guessSegment(company, title) {
  const t = (String(company || "") + " " + String(title || "")).toLowerCase();
  if (/\b(capital|ventures?|fund|invest|partners lp|philanthrop)\b/.test(t)) return "funder";
  if (/\b(foundation|charity|non-?profit|trust|society|association)\b/.test(t)) return "third-sector";
  if (/\b(institute|institut|research|centre|center|laborator|think tank|policy)\b/.test(t)) return "research-institute";
  if (/\b(safety|alignment|interpretab|frontier|lab|labs)\b/.test(t)) return "ai-lab";
  if (/\b(ai|ml|machine learning|llm|model|agent|autonomous)\b/.test(t)) return "ai-firm";
  return null;
}

// SEED rows from postings [{company, title, url}]: one per organisation, website only when the posting is on the organisation's own host.
export function seedRows(postings) {
  const seen = new Map();
  for (const p of postings || []) {
    const org = String(p.company || "").trim();
    const key = normName(org);
    if (!org || key.length < 3) continue;
    const segment = guessSegment(org, p.title);
    if (!segment) continue;
    let website = null;
    try {
      const u = new URL(p.url);
      if (u.protocol === "https:" && !ATS_HOST.test(u.hostname) && !/^(jobs|careers|apply)\./i.test(u.hostname)) website = u.origin;
    } catch (e) { /* no usable url */ }
    const have = seen.get(key);
    if (have) { if (!have.website && website) have.website = website; continue; } // a later posting on the organisation's own host fills in a site the first one lacked
    seen.set(key, { org, segment, website });
  }
  return [...seen.values()];
}

// Candidate origins for a company with no known site. Each is only accepted after verifySite reads the page.
export function candidateSites(company) {
  const slug = normName(company);
  if (slug.length < 3) return [];
  return ["org", "com", "ai", "io", "net"].map((tld) => "https://" + slug + "." + tld);
}

const strip = (h) => String(h || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ");
const text = (h) => strip(h).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const meta = (h, name) => { const m = new RegExp("<meta[^>]+(?:name|property)=[\"']" + name + "[\"'][^>]*content=[\"']([^\"']*)[\"']", "i").exec(h) || new RegExp("<meta[^>]+content=[\"']([^\"']*)[\"'][^>]*(?:name|property)=[\"']" + name + "[\"']", "i").exec(h); return m ? text(m[1]) : ""; };

// VERIFY that the page is the organisation's: the title, site name or first heading must contain the normalised company name.
export function verifySite(html, company) {
  const want = normName(company);
  if (want.length < 3) return false;
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || "";
  const h1 = (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || "";
  const hay = normName(text(title) + " " + meta(html, "og:site_name") + " " + text(h1));
  return hay.includes(want);
}

// The registrable-ish host a contact address must live on: the site's own host without www.
export const siteHost = (origin) => { try { return new URL(origin).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; } };

const ROLE = /^(info|hello|hi|contact|office|team|partnerships?|partners|research|collaborat\w*|enquir\w*|inquir\w*|admin|press|media|programmes?|programs?|grants?|funding|submissions?|opportunities)$/i;
// CONTACT: addresses on the site's own domain only (mailto links first, then plain text), role addresses preferred. Returns {email, role} or null.
export function extractContact(html, origin) {
  const host = siteHost(origin);
  if (!host) return null;
  const found = new Set();
  const rx = /[a-z0-9._%+-]{1,64}@[a-z0-9.-]{3,}\.[a-z]{2,}/gi;
  for (const m of String(html || "").replace(/&#64;|&commat;|\s*\[at\]\s*/gi, "@").matchAll(rx)) {
    const e = m[0].toLowerCase().replace(/^mailto:/, "");
    const dom = e.split("@")[1];
    if ((dom === host || dom.endsWith("." + host)) && !/\.(png|jpe?g|gif|svg|webp)$/.test(e) && !/^(noreply|no-reply|donotreply|privacy|abuse|webmaster|security|dmca|legal|unsubscribe|postmaster)@/.test(e)) found.add(e);
  }
  const all = [...found];
  const role = all.find((e) => ROLE.test(e.split("@")[0]));
  const pick = role || all[0];
  return pick ? { email: pick, role: !!role } : null;
}

// FIT NOTE: the organisation's own description of its work, quoted, so the reason is theirs and checkable at source_url.
export function extractFitNote(html) {
  let d = meta(html, "description") || meta(html, "og:description");
  if (d.length < 60) { for (const m of strip(html).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) { const t = text(m[1]); if (t.length >= 80) { d = t; break; } } }
  d = d.replace(/\s+/g, " ").trim();
  if (d.length < 40) return null;
  if (d.length > 220) d = d.slice(0, 220).replace(/\s+\S*$/, "").replace(/[\s,;:.—-]+$/, "") + "…";
  return "its own site describes its work as “" + d.replace(/[“”"]/g, "'") + "”";
}

const FIT_WORDS = {
  "ai-lab": /\b(ai safety|alignment|interpretab\w*|oversight|autonomous|agentic|frontier|machine learning|artificial intelligence|evaluation|robust\w*)\b/g,
  "funder": /\b(invest\w*|portfolio|fund(?:ing|s|ed)?|grants?|venture|philanthrop\w*|seed|early[- ]stage)\b/g,
  "research-institute": /\b(research|institute|policy|evaluation|evidence|analysis|public interest|independent)\b/g,
  "third-sector": /\b(non-?profit|charit\w*|foundation|social impact|evaluation|community|public benefit|mission)\b/g,
  "ai-firm": /\b(ai|machine learning|llm|models?|platform|agents?|automation|autonomous)\b/g,
};
// FIT in [0,1]: distinct segment terms on the pages. Under 0.5 (the lane's min_fit) the target is not queued.
export function scoreFit(pageText, segment) {
  const rx = FIT_WORDS[segment];
  if (!rx) return 0;
  const hits = new Set(String(pageText || "").toLowerCase().match(rx) || []);
  return Math.min(0.95, hits.size ? 0.3 + 0.2 * hits.size : 0.2);
}

// ROBOTS: false when the wildcard group disallows the whole site. Anything unreadable allows nothing it cannot read: the caller treats a missing file as allowed.
export function robotsAllows(robotsTxt) {
  // groups: each User-agent line starts (or extends) a group; a group naming this bot overrides the wildcard group, as the robots standard says
  const groups = [];
  let cur = null, lastWasUa = false;
  for (const raw of String(robotsTxt || "").split(/\r?\n/)) {
    const l = raw.replace(/#.*/, "").trim();
    const ua = /^user-agent:\s*(.+)$/i.exec(l);
    if (ua) { if (!cur || !lastWasUa) { cur = { agents: [], disallowAll: false }; groups.push(cur); } cur.agents.push(ua[1].trim().toLowerCase()); lastWasUa = true; continue; }
    lastWasUa = false;
    if (cur && /^disallow:\s*\/\s*$/i.test(l)) cur.disallowAll = true;
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && a && USER_AGENT.toLowerCase().includes(a)));
  const applicable = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return !applicable.some((g) => g.disallowAll);
}

// ASSESS one organisation from the pages read: pages = [{url, html}]. Returns {email, fit_note, fit, source_url, role_address} when it can be queued, else {reason}.
export function assess(org, segment, origin, pages) {
  const ok = pages.filter((p) => p && p.html);
  if (!ok.length) return { reason: "no-pages" };
  if (!ok.some((p) => verifySite(p.html, org))) return { reason: "site-not-verified" };
  let contact = null;
  for (const p of ok) { contact = extractContact(p.html, origin); if (contact) break; }
  if (!contact) return { reason: "no-public-address" };
  let note = null, src = null;
  for (const p of ok) { note = extractFitNote(p.html); if (note) { src = p.url; break; } }
  if (!note) return { reason: "no-quotable-description" };
  const fit = scoreFit(ok.map((p) => text(p.html)).join(" "), segment);
  return { email: contact.email, role_address: contact.role, fit_note: note, fit, source_url: src };
}
