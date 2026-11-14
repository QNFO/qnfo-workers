// RUNS-ON-1: the Ultrastable runtime shell. One page skeleton, one status vocabulary and one mark shared by every system that runs on Ultrastable.
// Inlinable: no import, no export, no block comment, US_/us names only. An instance inlines this file verbatim (or loads it with new Function)
// and calls usTopBar, usStatusPanel and usFooter; colours come from the instance's --ds-* tokens, so an instance varies only its accent.
var US_SHELL_CSS = ".us-top{position:sticky;top:0;z-index:10;background:var(--ds-surface);border-top:4px solid var(--ds-accent);border-bottom:1px solid var(--ds-line)}\n.us-top-in{max-width:960px;margin:0 auto;padding:6px 16px;display:flex;align-items:center;flex-wrap:wrap;gap:4px 12px;min-height:56px}\n.us-top .us-name{display:flex;align-items:center;gap:8px;margin-right:auto;min-height:44px;font:700 17px/1.2 var(--ds-font);color:var(--ds-ink);text-decoration:none}\n.us-top .us-name i{width:10px;height:10px;border-radius:50%;background:var(--ds-accent);display:inline-block;flex:none}\n.us-top .us-name small{font-weight:500;font-size:14px;color:var(--ds-ink-2)}\n.us-right{display:flex;align-items:center;gap:8px}\n.us-mark,.us-top .us-mark,.us-foot .us-mark{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 4px;font:500 14px/1.2 var(--ds-font);color:var(--ds-ink-2);text-decoration:none;white-space:nowrap}\n.us-mark::before{content:\"\";width:12px;height:12px;flex:none;border-radius:50%;border:2px solid var(--ds-accent);box-shadow:inset 0 0 0 2px var(--ds-surface),inset 0 0 0 6px var(--ds-accent)}\n.us-top .us-mark:hover,.us-foot .us-mark:hover,.us-top .us-name:hover{color:var(--ds-ink)}\n.us-status{max-width:960px;margin:16px auto;padding:0 16px}\n.us-status .us-sentence{margin:0 0 12px;padding:4px 0 4px 12px;border-left:4px solid var(--ds-line-strong);font:400 18px/1.45 var(--ds-font);color:var(--ds-ink)}\n.us-sentence.us-good{border-left-color:var(--ds-good)}.us-sentence.us-warn{border-left-color:var(--ds-warn)}.us-sentence.us-bad{border-left-color:var(--ds-bad)}\n.us-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:8px;margin:0;padding:0;list-style:none}\n.us-tile{background:var(--ds-surface);border:1px solid var(--ds-line);border-top:4px solid var(--ds-line);border-radius:var(--ds-r-m);padding:10px 12px}\n.us-tile.us-good{border-top-color:var(--ds-good)}.us-tile.us-warn{border-top-color:var(--ds-warn)}.us-tile.us-bad{border-top-color:var(--ds-bad)}\n.us-label{display:block;font-size:14px;line-height:1.3;color:var(--ds-ink-2)}\n.us-val{display:block;font:650 24px/1.25 var(--ds-font);font-variant-numeric:tabular-nums;color:var(--ds-ink)}\n.us-val small{font-size:14px;font-weight:500;color:var(--ds-ink-2)}\n.us-tile.us-unknown .us-val{color:var(--ds-ink-2)}\n.us-defs{margin:8px 0 0;font-size:14px;color:var(--ds-ink-2)}\n.us-defs summary{display:inline-flex;align-items:center;min-height:44px;cursor:pointer;color:var(--ds-accent)}\n.us-defs dl{margin:4px 0 0}.us-defs dt{font-weight:650;color:var(--ds-ink)}.us-defs dd{margin:0 0 8px}\n.us-status .us-asof{margin:4px 0 0;font-size:14px;color:var(--ds-ink-2)}\n.us-foot{max-width:960px;margin:24px auto 0;padding:8px 16px;border-top:1px solid var(--ds-line);display:flex;justify-content:center}\n.us-top :focus-visible,.us-status :focus-visible,.us-foot :focus-visible{outline:3px solid var(--ds-focus);outline-offset:2px;border-radius:var(--ds-r-s)}\n@media (max-width:640px){.us-top-in{padding:4px 12px}.us-val{font-size:22px}.us-status .us-sentence{font-size:17px}}\n@media (prefers-reduced-motion:reduce){.us-top *,.us-status *,.us-foot *{transition:none!important;animation:none!important}}\n.us-main{max-width:960px;margin:0 auto;padding:0 16px}";
var US_SHELL_CONTRACT = {"id":"RUNS-ON-1","name":"Ultrastable runtime shell","version":"1.0.3","requires":"the --ds-* token contract of doctrine/design.json (token_contract plus --ds-font, --ds-mono, --ds-r-s, --ds-r-m, --ds-r-l), supplied by the instance's portfolio layer","layers":{"core":"Never varies between instances: the skeleton below, the status vocabulary (keys, labels, thresholds, wording), the mark, the type scale, 44 px targets, the focus ring, reduced motion, and good/warn/bad as the only status colours.","portfolio":"Neutrals, status colours, type pair and shape come from the instance's portfolio through the --ds-* tokens; the shell never names a colour.","instance":"An instance supplies only its name, a short plane label, its accent (through --ds-accent) and the live values."},"skeleton":[{"slot":"top","render":"usTopBar","holds":"instance name, plane label, accent stripe, the instance's own controls, the mark"},{"slot":"status","render":"usStatusPanel","holds":"one status sentence, then one tile per vocabulary key, definitions behind a disclosure"},{"slot":"content","render":"instance","holds":"the instance's own screens"},{"slot":"foot","render":"usFooter","holds":"the mark"}],"vocabulary":[{"key":"k_eff","label":"Criticality (k)","format":"fixed2","polarity":"higher","good":1,"warn":0.5,"define":"Verified releases in the last 24 hours per unit of cost and human attention. At 1 or more the system sustains itself."},{"key":"open_ignition_gaps","label":"Open ignition gaps","format":"int","polarity":"lower","good":0,"warn":3,"define":"Links in the chain that still need a person or an outside input to run. Self-sustaining is claimed only at 0."},{"key":"loops_running","label":"Loops running","format":"int","polarity":"none","of":"loops_total","define":"Loops that reported in on their own clock within their allowed window."},{"key":"loops_stalled","label":"Loops stalled","format":"int","polarity":"lower","good":0,"warn":2,"define":"Loops that missed their window. Each one is restarted or replaced by the system."},{"key":"items_in_24h","label":"Items in, 24 h","format":"int","polarity":"none","define":"Work items that entered the queue in the last 24 hours."},{"key":"items_out_24h","label":"Items out, 24 h","format":"int","polarity":"higher","relative_to":"items_in_24h","good":1,"warn":0.67,"define":"Work items closed with evidence in the last 24 hours. Healthy when at least as many leave as arrive."},{"key":"cost_vs_budget","label":"Cost pace","format":"times","polarity":"lower","good":1,"warn":1.25,"define":"Spending pace over the budget. 1 means exactly on budget."}],"sentence":{"sustaining":"Self-sustaining","not_yet":"Not yet self-sustaining","unknown":"Status unknown","rule":"self-sustaining when k_eff >= 1 and open_ignition_gaps = 0"},"mark":{"text":"Runs on Ultrastable","href":"https://ultrastable.io","title":"This system runs on Ultrastable: the same page skeleton, status vocabulary and self-running loops as every Ultrastable system."}};
var US_SHELL_VERSION = US_SHELL_CONTRACT.version;
function usEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function usSpec(key) { return US_SHELL_CONTRACT.vocabulary.filter(function (v) { return v.key === key; })[0] || null; }
function usNum(v) { if (v == null || v === "") return null; var n = Number(v); return isFinite(n) ? n : null; }
function usFmt(key, v) {
  var s = usSpec(key), n = usNum(v);
  if (n == null) return "n/a";
  if (s && s.format === "fixed2") return n.toFixed(2);
  if (s && s.format === "times") return (Math.round(n * 100) / 100).toString() + "\u00d7";
  return Math.round(n).toLocaleString("en-US");
}
// good | warn | bad from the vocabulary thresholds; none for a key with no polarity; unknown when the value (or its reference) is missing.
function usVerdict(key, values) {
  var s = usSpec(key), n = usNum(values && values[key]);
  if (!s) return "none";
  if (n == null) return "unknown";
  if (s.polarity === "none") return "none";
  if (s.relative_to) {
    var ref = usNum(values[s.relative_to]);
    if (ref == null) return "unknown";
    n = ref === 0 ? s.good : n / ref;
  }
  if (s.polarity === "higher") return n >= s.good ? "good" : n >= s.warn ? "warn" : "bad";
  return n <= s.good ? "good" : n <= s.warn ? "warn" : "bad";
}
function usWorst(values) {
  var rank = { good: 1, warn: 2, bad: 3 }, w = 0, out = "unknown";
  US_SHELL_CONTRACT.vocabulary.forEach(function (s) { var v = usVerdict(s.key, values); if (rank[v] && rank[v] > w) { w = rank[v]; out = v; } });
  return out;
}
function usSustaining(values) {
  var k = usNum(values && values.k_eff), g = usNum(values && values.open_ignition_gaps);
  if (k == null || g == null) return null;
  return k >= 1 && g === 0;
}
// One sentence: the verdict first, then the numbers behind it. Missing numbers are left out, never shown as zero.
function usStatusSentence(values) {
  values = values || {};
  var S = US_SHELL_CONTRACT.sentence, st = usSustaining(values), parts = [];
  var head = st === true ? S.sustaining : st === false ? S.not_yet : S.unknown;
  if (usNum(values.k_eff) != null) parts.push("criticality " + usFmt("k_eff", values.k_eff));
  var g = usNum(values.open_ignition_gaps);
  if (g != null) parts.push(g === 0 ? "no open ignition gaps" : g + " open ignition gap" + (g === 1 ? "" : "s"));
  var lr = usNum(values.loops_running), lt = usNum(values.loops_total);
  if (lr != null) parts.push(lr + (lt != null ? " of " + lt : "") + " loops running");
  var ii = usNum(values.items_in_24h), io = usNum(values.items_out_24h);
  if (ii != null && io != null) parts.push(ii + " items in and " + io + " out in 24 h");
  if (usNum(values.cost_vs_budget) != null) parts.push("cost at " + usFmt("cost_vs_budget", values.cost_vs_budget) + " budget");
  return head + (parts.length ? ": " + parts.join(", ") : "") + ".";
}
function usMark() {
  var m = US_SHELL_CONTRACT.mark;
  return '<a class="us-mark" href="' + usEsc(m.href) + '" rel="noopener" title="' + usEsc(m.title) + '" data-runs-on="ultrastable">' + usEsc(m.text) + "</a>";
}
// o: { name, sub, href, right } ; right is the instance's own controls (trusted HTML from the instance).
function usTopBar(o) {
  o = o || {};
  return '<header class="us-top" data-us-shell="' + usEsc(US_SHELL_VERSION) + '"><div class="us-top-in"><a class="us-name" href="' + usEsc(o.href || "/") + '"><i aria-hidden="true"></i>' + usEsc(o.name || "System") +
    (o.sub ? " <small>" + usEsc(o.sub) + "</small>" : "") + '</a><div class="us-right">' + (o.right || "") + usMark() + "</div></div></header>";
}
// values: { k_eff, open_ignition_gaps, loops_running, loops_total, loops_stalled, items_in_24h, items_out_24h, cost_vs_budget }; o: { as_of, sources }
function usStatusPanel(values, o) {
  values = values || {}; o = o || {};
  var tiles = US_SHELL_CONTRACT.vocabulary.map(function (s) {
    var v = usVerdict(s.key, values), of = s.of && usNum(values[s.of]) != null && usNum(values[s.key]) != null ? " <small>of " + usFmt(s.of, values[s.of]) + "</small>" : "";
    var src = o.sources && o.sources[s.key] ? " Source: " + o.sources[s.key] + "." : "";
    return '<li class="us-tile us-' + v + '" data-key="' + usEsc(s.key) + '" title="' + usEsc(s.define + src) + '"><span class="us-label">' + usEsc(s.label) + '</span><b class="us-val">' + usEsc(usFmt(s.key, values[s.key])) + of + "</b></li>";
  }).join("");
  var defs = US_SHELL_CONTRACT.vocabulary.map(function (s) {
    var src = o.sources && o.sources[s.key] ? " Source here: " + o.sources[s.key] + "." : "";
    return "<dt>" + usEsc(s.label) + "</dt><dd>" + usEsc(s.define + src) + "</dd>";
  }).join("");
  return '<section class="us-status" aria-label="System status" data-us-shell="' + usEsc(US_SHELL_VERSION) + '"><p class="us-sentence us-' + (usSustaining(values) === null ? "unknown" : usWorst(values)) + '" role="status">' + usEsc(usStatusSentence(values)) + "</p>" +
    '<ul class="us-tiles">' + tiles + "</ul>" + '<details class="us-defs"><summary>What these numbers mean</summary><dl>' + defs + "</dl></details>" +
    (o.as_of ? '<p class="us-asof">As of ' + usEsc(o.as_of) + "</p>" : "") + "</section>";
}
function usFooter() { return '<footer class="us-foot">' + usMark() + "</footer>"; }
// A whole page for a surface that has no head of its own. tokenCss is the portfolio layer (the --ds-* block); body is the instance's content.
function usPage(o) {
  o = o || {};
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + usEsc(o.title || o.name || "System") + "</title>" +
    (o.description ? '<meta name="description" content="' + usEsc(o.description) + '">' : "") + "<style>" + (o.tokenCss || "") + "\n" + US_SHELL_CSS + "\n" + (o.css || "") + '</style></head><body class="ds">' +
    usTopBar(o) + usStatusPanel(o.values, o) + '<main class="us-main">' + (o.body || "") + "</main>" + usFooter() + "</body></html>";
}
