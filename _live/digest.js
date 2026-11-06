
/* ISSUE-ROLLUP-1: one [digest] issue per program lists the open agent_issues that are not individual issues, and one lists the open goals while
 * roadmap_mirror_scope has goals at mirrored = 0. A digest is rewritten only when its body changed (gh_digest_links.body_hash), and one whose group
 * emptied is closed. It carries the label fleet-digest, never fleet-issue or roadmap, so no other loop treats it as a mirror. */
function tsHash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return String(h); }
function tsDigestBody(head, lines, cap) {
  var out = head + "\n\n| ref | priority | item |\n|:--|:--|:--|\n", used = out.length, shown = 0;
  for (var i = 0; i < lines.length; i++) {
    if (used + lines[i].length + 1 > cap) break;
    out += lines[i] + "\n"; used += lines[i].length + 1; shown++;
  }
  if (shown < lines.length) out += "\n...and " + (lines.length - shown) + " more (qnfo-audit is authoritative).\n";
  return out;
}
function tsCell(s) { return String(s || "").replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 120); }
async function tsDigest(env, out) {
  if (!TS_INDIVIDUAL || ghLimited()) return;
  var groups = {};
  var inds = TS_INDIVIDUAL.map(function () { return "?"; }).join(",");
  var rows = ((await env.AUDIT.prepare("SELECT a.id, a.title, a.priority, COALESCE(m.program_code, 'other') AS prog FROM agent_issues a LEFT JOIN issue_project_map m ON m.issue_id = a.id WHERE a.status = 'open' AND lower(a.priority) NOT IN (" + inds + ") ORDER BY CASE a.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, a.id").bind(...TS_INDIVIDUAL).all()).results) || [];
  rows.forEach(function (r) {
    var k = "issues:" + r.prog;
    if (!groups[k]) groups[k] = { title: "[digest] " + r.prog + " · open issues below " + TS_INDIVIDUAL.join("/"), head: "Rolled up by ISSUE-ROLLUP-1. These agent_issues are open in `qnfo-audit.agent_issues` (authoritative; each closes there with close evidence). Only priority " + TS_INDIVIDUAL.join(", ") + " keeps an issue each.", lines: [] };
    groups[k].lines.push("| #" + r.id + " | " + r.priority + " | " + tsCell(r.title) + " |");
  });
  var gs = null;
  try { gs = await env.AUDIT.prepare("SELECT mirrored FROM roadmap_mirror_scope WHERE source = 'goals'").first(); } catch (e) { gs = null; }
  if (gs && Number(gs.mirrored) === 0) {
    var goals = ((await env.AUDIT.prepare("SELECT id, item, status FROM roadmap_implementation WHERE source = 'goals' ORDER BY id").all()).results) || [];
    var open = goals.filter(function (g) { return !PS_RM_DONE[g.status]; });
    if (open.length) groups["goals"] = { title: "[digest] open goals", head: "Rolled up by ISSUE-ROLLUP-1. Open goals with a definition of done, from `qnfo-audit.roadmap_implementation` (source goals); also in GET /roadmap and on the Projects board.", lines: open.map(function (g) { return "| RM-" + g.id + " | " + g.status + " | " + tsCell(g.item) + " |"; }) };
  }
  var links = ((await env.AUDIT.prepare("SELECT dkey, gh_number, body_hash FROM gh_digest_links").all()).results) || [];
  var byKey = {}; links.forEach(function (l) { byKey[l.dkey] = l; });
  var now = new Date().toISOString(), calls = 0, keys = Object.keys(groups), res = { groups: keys.length, written: 0, closed: 0 };
  for (var i = 0; i < keys.length && calls < 12; i++) {
    var k = keys[i], g = groups[k], title = g.title + " (" + g.lines.length + ")", hash = tsHash(title + "\n" + g.lines.join("\n")), l = byKey[k];
    if (l && l.body_hash === hash) continue;
    var body = tsDigestBody(g.head + " (" + g.lines.length + " rows, " + now.slice(0, 16) + "Z)", g.lines, 60000);
    calls++;
    var r = l ? await gh(env, "PATCH", TS_REPO + "/issues/" + l.gh_number, { title: title, body: body, state: "open" }) : await gh(env, "POST", TS_REPO + "/issues", { title: title, body: body, labels: ["fleet-digest"] });
    if (r.status >= 200 && r.status < 300 && r.body && (l || r.body.number)) {
      await env.AUDIT.prepare("INSERT OR REPLACE INTO gh_digest_links (dkey, gh_number, body_hash, n, synced_at) VALUES (?, ?, ?, ?, ?)").bind(k, l ? l.gh_number : r.body.number, hash, g.lines.length, now).run();
      res.written++;
    } else { out.errors.push({ scope: "digest " + k, status: r.status, why: String(r.text).slice(0, 100) }); if (r.limited) break; }
  }
  for (var j = 0; j < links.length && calls < 12; j++) {
    if (groups[links[j].dkey] || links[j].body_hash === "closed") continue;
    calls++;
    var c = await gh(env, "PATCH", TS_REPO + "/issues/" + links[j].gh_number, { state: "closed", state_reason: "completed" });
    if (c.status >= 200 && c.status < 300) { await env.AUDIT.prepare("UPDATE gh_digest_links SET body_hash = 'closed', n = 0, synced_at = ? WHERE dkey = ?").bind(now, links[j].dkey).run(); res.closed++; }
  }
  out.digest = res;
}

