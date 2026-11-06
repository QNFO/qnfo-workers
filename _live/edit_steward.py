import sys
p = sys.argv[1] + '/qnfo-github-steward/worker.js'
s = open(p, encoding='utf-8').read()
digest = open(sys.argv[2], encoding='utf-8').read()

def rep(a, b):
    global s
    assert s.count(a) == 1, (a[:70], s.count(a))
    s = s.replace(a, b)

rep('var VERSION = "0.9.1-keep-catalogue-project"; // ',
    'var VERSION = "0.10.0-issue-rollup"; // 0.10.0 ISSUE-ROLLUP-1 (owner directive 2026-10-26 "reduce open issues to <100", pillar autonomy; minor: a decision the worker now takes on its own): an agent_issues row whose priority is not in ops_config gh_individual_priorities (default critical) is no longer its own GitHub issue; its mirror is closed not_planned and D1 stays authoritative and open; one [digest] issue per program lists the rolled rows (gh_digest_links), and one lists the goals while roadmap_mirror_scope has goals at mirrored = 0. Deleting the ops_config key restores one issue per row. // 0.9.1 PS-KEEP-CATALOGUE-PROJECT-1 ')
# the old text continues right after "// " : fix the doubled prefix
s = s.replace('// 0.9.1 PS-KEEP-CATALOGUE-PROJECT-1 0.9.1 PS-KEEP-CATALOGUE-PROJECT-1', '// 0.9.1 PS-KEEP-CATALOGUE-PROJECT-1')

rep('function tsGhWant(status) {', '''/* ISSUE-ROLLUP-1: priorities that stay one GitHub issue each (ops_config gh_individual_priorities, comma list). Key absent or unreadable = every priority is individual (the old behaviour). */
var TS_INDIVIDUAL = null;
async function tsLoadIndividual(env) {
  try {
    var r = await env.AUDIT.prepare("SELECT value FROM ops_config WHERE key = 'gh_individual_priorities'").first();
    var v = r && String(r.value || "").trim().toLowerCase();
    TS_INDIVIDUAL = v ? v.split(/[,\\s]+/).filter(Boolean) : null;
  } catch (e) { TS_INDIVIDUAL = null; }
}
function tsIsRolled(priority) { return !!TS_INDIVIDUAL && TS_INDIVIDUAL.indexOf(String(priority || "").toLowerCase()) < 0; }
function tsGhWant(status) {''')
rep('async function tsIssues(env, out) {\n  var now = new Date().toISOString();', 'async function tsIssues(env, out) {\n  var now = new Date().toISOString();\n  await tsLoadIndividual(env);')
rep('a.status, a.title, a.updated_at', 'a.status, a.priority, a.title, a.updated_at')
rep('var wantOpen = function (l) { return tsGhWant(l.status).open; };', 'var wantOpen = function (l) { return tsGhWant(l.status).open && !(l.status === "open" && tsIsRolled(l.priority)); };')
rep('function (l) { return !!l.d1_status && tsGhWant(l.d1_status).open !== tsGhWant(l.status).open; });',
    'function (l) { return (l.status === "open" && tsIsRolled(l.priority)) || (!!l.d1_status && tsGhWant(l.d1_status).open !== tsGhWant(l.status).open); });')
rep('var l = mism[i], r, want = tsGhWant(l.status), reason = null;',
    'var l = mism[i], r, rolled = l.status === "open" && tsIsRolled(l.priority), want = rolled ? { open: false, reason: "not_planned" } : tsGhWant(l.status), reason = null;')
rep('var note = await tsCloseComment(env, l);',
    'var note = rolled ? "Rolled up by ISSUE-ROLLUP-1: agent_issues " + l.issue_id + " (priority " + l.priority + ") is still open in qnfo-audit, which is authoritative. It is listed in its program\'s [digest] issue; only priority " + TS_INDIVIDUAL.join(", ") + " keeps an issue each. This close is not a verification." : await tsCloseComment(env, l);')
rep('''WHERE a.status = 'open' AND l.issue_id IS NULL ORDER BY a.id LIMIT ?"
  ).bind(TS_CREATE_PER_TICK).all()''',
    '''WHERE a.status = 'open' AND l.issue_id IS NULL" + (TS_INDIVIDUAL ? " AND lower(a.priority) IN (" + TS_INDIVIDUAL.map(function () { return "?"; }).join(",") + ")" : "") + " ORDER BY a.id LIMIT ?"
  ).bind(...(TS_INDIVIDUAL || []), TS_CREATE_PER_TICK).all()''')
rep('function tsPrNum(url) {', digest + 'function tsPrNum(url) {')
rep('''  try { await tsCodeTasks(env, out); }''', '''  try { await tsDigest(env, out); } catch (e) { out.errors.push({ scope: "tracker-digest", why: String(e && e.message || e).slice(0, 160) }); }
  try { await tsCodeTasks(env, out); }''')
open(p, 'w', encoding='utf-8', newline='').write(s)
