const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ARXIV = 'https://export.arxiv.org/api/query';
const CATS = '(cat:quant-ph OR cat:math-ph OR cat:hep-th OR cat:math.NT OR cat:cs.IT OR cat:math.LO OR cat:math.CT OR cat:physics.soc-ph OR cat:physics.hist-ph)';
const EMAIL_URL = 'https://qnfo-email.internal/send';
const ZENODO = 'https://zenodo.org/api/records';
const ALERTS = 'alerts@qnfo.org';
const DAILY_KW = {
  UMP: [5, ['ultrametric','p-adic','padic','adelic','adele','idele','ostrowski','bruhat-tits','non-archimedean','nonarchimedean','adelic-physics','ultrametric-physics','non-archimedean-physics','p-adic-quantum','archimedean-completion','place-democracy','ostrowski-theorem','product-formula','adele-ring','idele-class-group','restricted-direct-product','strong-approximation','weak-approximation','sagemath','pari-gp']],
  RES: [4, ['consilience','cross-domain-consilience','interdisciplinary-synthesis','transdisciplinary','unity-of-science','unification-physics','measurement-stratigraphy','measurement-theory','metrology-foundations','silent-radix','operationalism','epistemology-of-measurement','ruliad','wolfram-physics','multiway-system','causal-invariance','branchial-space','rulial-space','hypergraph-rewriting','autaxys','quantum-coherence-biology','room-temperature-quantum-biology','compton-bt','compton-bruhat-tits','frequency-valuation','planck-scale-physics','quantum-gravity-phenomenology','foundational-physics','theory-of-everything','quantum-foundations','interpretation-of-quantum-mechanics','consistent-histories','category-theory-physics','applied-category-theory']],
  INM: [3, ['information-physics','physical-information','information-fundamental','it-from-bit','bit-from-it','informational-universe','landauer-principle','landauer-bound','landauer-limit','bekenstein-bound','holographic-bound','bremermann-limit','margolus-levitin','shannon-entropy','kolmogorov-complexity','algorithmic-information-theory','solomonoff-induction','minimum-description-length','chaitin-constant','thermodynamics-of-computation','maxwell-demon','szilard-engine','reversible-computing','entropy-production','information-geometry','fisher-information','amari-metric','statistical-manifold','natural-gradient','quantum-information','von-neumann-entropy','quantum-fisher','holographic-entropy','entanglement-entropy','ryu-takayanagi','free-energy-principle','bayesian-brain','predictive-coding','active-inference','variational-free-energy','integrated-information-theory','phi-measure','effective-information']],
  QEC: [4, ['quantum error correction','surface code','stabilizer code','topological code','qec decoder','quantum ldpc','gkp code','concatenated code','quantum repeater','toric code','color code','bacon shor','flag qubit','magic state distillation','quantum darwinism','error syndrome','decoding graph']],
  SLB: [2, ['laws-of-form','spencer-brown','calculus-of-indications','primary-algebra','primary-arithmetic','law-of-calling','law-of-crossing','distinction-algebra','boundary-logic','boundary-math','imaginary-boolean','self-reference-logic','autopoiesis','second-order-cybernetics']],
  CFE: [2, ['technology-forecasting','paradigm-forecasting','technology-roadmap','strategic-foresight','cascading-foresight','post-silicon-computing','beyond-cmos','novel-computing-substrate','computing-paradigm','neuromorphic','photonic-computing','quantum-computing-roadmap','dna-computing','molecular-computing','technology-diffusion','bass-model','fisher-pry','technology-readiness-level']]
};
function clean(s){ return String(s||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/\s+/g,' ').trim(); }
function xmlTag(s, tag){ var m = s.match(new RegExp('<'+tag+'[^>]*>([^]*?)</'+tag+'>')); return m ? m[1] : ''; }
function norm(s){ return String(s).toLowerCase().replace(/-/g,' '); }
function json(o, status){ return new Response(JSON.stringify(o), { status: status||200, headers: { 'Content-Type': 'application/json' } }); }
function yesterday(){ var d = new Date(Date.now() - 86400000); return d.toISOString().slice(0,10); }
function parseAtom(xml){
  var papers = [];
  var parts = xml.split('<entry>');
  for (var i = 1; i < parts.length; i++){
    var e = parts[i];
    var idRaw = xmlTag(e,'id');
    if (!idRaw) continue;
    var id = idRaw.split('/abs/').pop().split('v')[0];
    var pub = clean(xmlTag(e,'published')).slice(0,10);
    var sum = clean(xmlTag(e,'summary'));
    var authors = [];
    var re = /<author>([^]*?)<\/author>/g;
    var m;
    while ((m = re.exec(e))){ var nm = clean(xmlTag(m[1],'name')); if (nm) authors.push(nm); }
    var cm = e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/);
    papers.push({ id: id, title: clean(xmlTag(e,'title')), published: pub, summary: sum, authors: authors, primary_cat: cm ? cm[1] : '', source: 'arXiv' });
  }
  return papers;
}
async function fetchArxiv(env, ymd){
  var df = 'submittedDate:[' + ymd + '0000 TO ' + ymd + '2359]';
  var url = ARXIV + '?search_query=' + encodeURIComponent(CATS + ' AND ' + df) + '&start=0&max_results=200&sortBy=submittedDate&sortOrder=descending';
  var r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('arxiv ' + r.status);
  return parseAtom(await r.text());
}
function matchPapers(papers){
  var results = [];
  for (var i = 0; i < papers.length; i++){
    var p = papers[i];
    var text = norm((p.title||'') + ' ' + (p.summary||''));
    var matches = {}; var total = 0; var bestProg = null; var bestW = 0;
    for (var prog in DAILY_KW){
      var weight = DAILY_KW[prog][0]; var kws = DAILY_KW[prog][1];
      var hits = kws.filter(function(kw){ return text.indexOf(norm(kw)) >= 0; });
      if (hits.length){ var s = hits.length * weight; total += s; matches[prog] = hits; if (weight > bestW){ bestW = weight; bestProg = prog; } }
    }
    if (total > 0) results.push(Object.assign({}, p, { matches: matches, score: total, primary_program: bestProg }));
  }
  results.sort(function(a,b){ return b.score - a.score; });
  return results;
}
function formatBrief(papers, dateStr){
  var out = [];
  out.push('QNFO Research Daily Briefing (arXiv) - ' + dateStr);
  out.push('='.repeat(60));
  if (!papers.length){ out.push('\nNo new papers matched QNFO keywords.'); return out.join('\n'); }
  var high = papers.filter(function(p){ return p.score >= 10; });
  var med = papers.filter(function(p){ return p.score >= 5 && p.score < 10; });
  var low = papers.filter(function(p){ return p.score < 5; });
  var tiers = [['HIGH RELEVANCE', high, 'RED'], ['MEDIUM', med, 'YELLOW'], ['LOW - SKIMMABLE', low, 'WHITE']];
  for (var t = 0; t < tiers.length; t++){
    var group = tiers[t][1]; var emoji = tiers[t][2];
    if (!group.length) continue;
    out.push(''); out.push(emoji + ' ' + tiers[t][0] + ' (' + group.length + ')');
    for (var j = 0; j < group.length; j++){
      var p = group[j];
      var authors = p.authors.slice(0,2).join(', ');
      if (p.authors.length > 2) authors += ' et al.';
      var kws = [];
      for (var k in p.matches){ kws = kws.concat(p.matches[k].slice(0,3)); }
      out.push('  [' + (p.primary_program||'') + '] ' + String(p.title).slice(0,110));
      out.push('         ' + authors + ' | ' + p.id + ' | ' + p.published);
      if (kws.length) out.push('         Keywords: ' + Array.from(new Set(kws)).sort().slice(0,5).join(', '));
      out.push('');
    }
  }
  var progs = Array.from(new Set(papers.map(function(p){ return p.primary_program; }).filter(Boolean)));
  out.push('-'.repeat(60));
  out.push(papers.length + ' papers in ' + progs.length + ' programs (arXiv): ' + progs.sort().join(', '));
  return out.join('\n');
}
async function sendEmail(env, to, subject, body, from){
  var bind = env["qnfo-email"];
  var key = env.EMAIL_API_KEY;
  if (!key) throw new Error('EMAIL_API_KEY missing (fail-closed)');
  var payload = { to: to, subject: subject, body: body };
  if (from) payload.from = from;
  var r = await (bind ? bind.fetch.bind(bind) : fetch)(EMAIL_URL, { method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(payload) });
  var txt = await r.text();
  if (!r.ok && txt.indexOf('"success":true') < 0) throw new Error('email ' + r.status + ' ' + txt.slice(0,120));
  return txt;
}
async function alertMsg(env, msg){
  try { await sendEmail(env, ALERTS, '[research-daily-brief] FAILED ' + new Date().toISOString(), msg); } catch(e){}
}
async function runBrief(env, dateStr, dry){
  var ymd = dateStr.replace(/-/g,'');
  var pid = dry ? '__DRY__' : '__BRIEF__';
  var ins = await env.OUTREACH_DB.prepare('INSERT OR IGNORE INTO sent_log (brief_date, paper_id, status) VALUES (?,?,?)').bind(dateStr, pid, 'pending').run();
  if (ins.meta.changes === 0) return { status: dry ? 'dry_already' : 'already_sent', date: dateStr };
  var papers = await fetchArxiv(env, ymd);
  var matched = matchPapers(papers);
  var text = formatBrief(matched, dateStr);
  var subject = 'QNFO Research Briefing - ' + dateStr;
  if (dry){
    await env.OUTREACH_DB.prepare('UPDATE sent_log SET status=?, sent_at=? WHERE brief_date=? AND paper_id=?').bind('dry', new Date().toISOString(), dateStr, pid).run();
    return { status: 'dry', date: dateStr, scanned: papers.length, matched: matched.length, preview: text.slice(0,500) };
  }
  try {
    var resp = await sendEmail(env, ALERTS, subject, text, '');
    await env.OUTREACH_DB.prepare('UPDATE sent_log SET status=?, sent_at=? WHERE brief_date=? AND paper_id=?').bind('sent', new Date().toISOString(), dateStr, pid).run();
    return { status: 'sent', date: dateStr, scanned: papers.length, matched: matched.length, email: resp.slice(0,80) };
  } catch(e){
    await env.OUTREACH_DB.prepare('UPDATE sent_log SET status=?, sent_at=? WHERE brief_date=? AND paper_id=?').bind('failed', new Date().toISOString(), dateStr, pid).run();
    throw e;
  }
}
function topicsFor(title){
  var t = title.toLowerCase();
  if (t.indexOf('primon') >= 0 || t.indexOf('zeta') >= 0) return ['all:"primon gas" OR all:"free Riemann gas" OR all:"prime partitions"', 'all:"automorphic L-functions"'];
  if (t.indexOf('distinction') >= 0 || t.indexOf('pre-arithmetic') >= 0) return ['all:"philosophy of mathematics" OR all:"foundations of arithmetic"', 'all:"identity" AND all:"counting"'];
  if (t.indexOf('measurement') >= 0) return ['all:"quantum measurement" OR all:"measurement problem"'];
  if (t.indexOf('adelic') >= 0 || t.indexOf('prime factors') >= 0) return ['all:"adelic" OR all:"p-adic" AND all:"quantum"'];
  return ['all:"mathematical physics" OR all:"foundations of physics"'];
}
async function scanOutreach(env){
  var today = new Date().toISOString().slice(0,10);
  var q = encodeURIComponent('metadata.creators.person_or_org.name:"Quni-Gudzinas"');
  var zr = await fetch(ZENODO + '?q=' + q + '&sort=mostrecent&size=20', { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!zr.ok) throw new Error('zenodo ' + zr.status);
  var zdata = await zr.json();
  var hits = (zdata.hits && zdata.hits.hits) || [];
  var count = 0;
  for (var i = 0; i < Math.min(hits.length, 2); i++){
    var title = ((hits[i].metadata && hits[i].metadata.title) || '').slice(0,150);
    var topics = topicsFor(title);
    for (var t = 0; t < topics.length; t++){
      var url2 = ARXIV + '?search_query=' + encodeURIComponent(topics[t] + ' AND submittedDate:[202408310000 TO 202608312359]') + '&start=0&max_results=10';
      var r2 = await fetch(url2, { headers: { 'User-Agent': UA } });
      if (!r2.ok) continue;
      var xml = await r2.text();
      var parts = xml.split('<entry>');
      for (var j = 1; j < parts.length; j++){
        var e = parts[j];
        var nm = clean(xmlTag(e,'name'));
        if (!nm) continue;
        var pid = (xmlTag(e,'id')||'').split('/abs/').pop();
        var ptitle = clean(xmlTag(e,'title')).slice(0,130);
        var am = e.match(/<arxiv:affiliation>([^]*?)<\/arxiv:affiliation>/);
        var aff = am ? clean(am[1]) : '';
        var ins = await env.OUTREACH_DB.prepare('INSERT OR IGNORE INTO outreach_candidates (scan_date, name, affiliation, paper_id, paper_title, topic, created_at) VALUES (?,?,?,?,?,?,?)').bind(today, nm, aff, pid, ptitle, topics[t], new Date().toISOString()).run();
        count += ins.meta.changes;
      }
    }
  }
  return { scanned: hits.length, new_candidates: count, date: today };
}
export default {
  async fetch(request, env){
    var url = new URL(request.url);
    try {
      if (url.pathname === '/health') return json({ ok: true, emailKey: !!env.EMAIL_API_KEY, db: !!env.OUTREACH_DB, time: new Date().toISOString() });
      if (url.pathname === '/run'){ var date = url.searchParams.get('date') || yesterday(); var dry = url.searchParams.get('dry') === '1'; return json(await runBrief(env, date, dry)); }
      if (url.pathname === '/scan') return json(await scanOutreach(env));
      if (url.pathname === '/candidates'){ var r = await env.OUTREACH_DB.prepare('SELECT * FROM outreach_candidates ORDER BY id DESC LIMIT 25').all(); return json(r.results); }
      return json({ ok: true, name: 'research-daily-brief', endpoints: ['/health','/run?date=YYYY-MM-DD&dry=1','/scan','/candidates'] });
    } catch(e){
      try { await alertMsg(env, String((e && e.stack) || e)); } catch(_){}
      return json({ error: String((e && e.message) || e) }, 500);
    }
  },
  async scheduled(event, env){
    try { await runBrief(env, yesterday(), false); await scanOutreach(env); }
    catch(e){ await alertMsg(env, 'scheduled run failed: ' + String((e && e.stack) || e)); }
  }
}