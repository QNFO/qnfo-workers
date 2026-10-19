// BAD-TAG-FILTER-1 offline suite (issue 2928, CodeQL js/bad-tag-filter and js/double-escaping): the HTML-to-text helpers of the four live workers
// that read fetched pages (qnfo-ai cleanText, personal-api cleanText, qnfo-ops stripHtml, radar-hub cleanHtml) are sliced out of worker.js and run.
// Proves: a script, style or noscript block ends at an end tag that carries whitespace or attributes (</script >, </style foo="x">, a newline before the
// closing bracket, upper case); an unclosed block runs to the end of the document and cannot leak its body as text; a name that only starts with
// "script" is not a block; plain pages read the same as before; &amp; is decoded last so "&amp;lt;" stays "&lt;" and "&amp;#60;" stays "&#60;";
// no worker keeps the old end-tag-exact regex; every mirror is identical; every worker has a VERSION above the pre-change one.
// qnfo-ai also tests a search result's host by parsing it (isDuckDuckGoUrl) and not by substring.
// Run: node scripts/bad-tag-filter.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (w, f = "worker.js") => readFileSync(join(root, w, f), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 240))); } };

const slice = (src, from, toName) => {
  const a = src.indexOf(from), b = src.indexOf('\n__name(' + toName + ',', a);
  if (a < 0 || b < a) throw new Error("block not found: " + from);
  return src.slice(a, b);
};
const load = (w, from, toName, fn) => {
  const cx = vm.createContext({ String, Object, parseInt, __name: (f) => f });
  vm.runInContext(slice(read(w), from, toName) + "\nthis.f = " + fn + ";", cx);
  return cx.f;
};
const fns = {
  "qnfo-ai": load("qnfo-ai", "function cleanText(html) {", "cleanText", "cleanText"),
  "personal-api": load("personal-api", "function cleanText(html) {", "cleanText", "cleanText"),
  "qnfo-ops": load("qnfo-ops", "function stripHtml(html) {", "stripHtml", "stripHtml"),
  "radar-hub": load("radar-hub", "var ENTITY_MAP = ", "cleanHtml", "cleanHtml")
};

for (const [w, f] of Object.entries(fns)) {
  const t = (html, want, label) => { const got = f(html); ok(got === want, w + ": " + label, [String(html).slice(0, 60), got]); };
  t("<p>Hello</p>", "Hello", "plain page");
  t("a<script>alert(1)</script>b", "a b", "script block");
  t("a<script>alert(1)</script >b", "a b", "end tag with a space");
  t('a<script>alert(1)</script foo="x">b', "a b", "end tag with an attribute");
  t("a<script>alert(1)</script\n>b", "a b", "end tag with a newline before the bracket");
  t("a<SCRIPT TYPE=text/javascript>alert(1)</SCRIPT>b", "a b", "upper case script with an attribute");
  t("a<style>p{color:red}</style\t>b", "a b", "style end tag with a tab");
  t("a<script>alert(1)", "a", "an unclosed script cannot leak its body");
  t("a<style>p{x}", "a", "an unclosed style cannot leak its body");
  t("a<scriptx>keep</scriptx>b", "a keep b", "a name that starts with script is not a block");
  t("a<script src=x></script>b<script>1</script>c", "a b c", "two blocks keep the text between them");
  t("one<script>x</script>two<style>y</style>three", "one two three", "script and style together");
  t("&nbsp;x&nbsp;", "x", "nbsp is a space");
  t("5 &lt; 6 &amp; 7 &gt; 4", "5 < 6 & 7 > 4", "named entities");
  t("&amp;lt;b&amp;gt;", "&lt;b&gt;", "double-escaped entities are decoded once");
  t("&amp;quot;", "&quot;", "&amp;quot; stays &quot;");
  t("<scr<script>ipt>alert(1)</script>x", "<scr x", "split tag name leaves no script");
  t("a   \n  b", "a b", "whitespace collapses");
  t("", "", "empty");
  t(null, "", "null");
}
// Worker-specific decoders.
ok(fns["qnfo-ai"]("it&#39;s &#x27;fine&#x27; &#039;ok&#039;") === "it's 'fine' 'ok'", "qnfo-ai: numeric apostrophes", fns["qnfo-ai"]("it&#39;s"));
ok(fns["personal-api"]("&#x26;lt;") === "&lt;", "personal-api: &#x26;lt; stays &lt;", fns["personal-api"]("&#x26;lt;"));
ok(fns["qnfo-ai"]("a<noscript>hidden</noscript >b") === "a b" && fns["personal-api"]("a<noscript>hidden</noscript >b") === "a b", "noscript blocks are removed in qnfo-ai and personal-api");
ok(fns["qnfo-ops"]("&#65;&#66;") === "AB" && fns["qnfo-ops"]("&amp;#60;") === "&#60;", "qnfo-ops: numeric entities decode and &amp;#60; stays &#60;", [fns["qnfo-ops"]("&#65;&#66;"), fns["qnfo-ops"]("&amp;#60;")]);
ok(fns["radar-hub"]("&amp;lt;&mdash;&#65;") === "&lt;—A", "radar-hub: single-pass decoding", fns["radar-hub"]("&amp;lt;&mdash;&#65;"));


// qnfo-ai search results: a result is dropped when its HOST is duckduckgo.com or a subdomain, not when the text appears anywhere in the URL
// (CodeQL js/incomplete-url-substring-sanitization).
{
  const src = read("qnfo-ai"), a = src.indexOf("function isDuckDuckGoUrl(href) {"), b = src.indexOf("\n}\n", a);
  ok(a > 0 && b > a, "qnfo-ai: isDuckDuckGoUrl is defined");
  const cx = vm.createContext({ URL, String });
  vm.runInContext(src.slice(a, b + 3) + "\nthis.f = isDuckDuckGoUrl;", cx);
  const f = cx.f;
  ok(f("https://duckduckgo.com/l/?uddg=x") && f("https://html.duckduckgo.com/html/") && f("https://DuckDuckGo.com/"), "duckduckgo.com and its subdomains are recognised");
  ok(!f("https://example.com/a?u=duckduckgo.com") && !f("https://duckduckgo.com.evil.example/") && !f("https://notduckduckgo.com/") && !f("https://example.com/duckduckgo.com/page"), "a URL that only mentions duckduckgo.com, or a look-alike host, is kept");
  ok(!f("not a url") && !f(""), "an unparseable value is not a duckduckgo URL");
  ok(!/href\.indexOf\("duckduckgo\.com"\)/.test(src), "qnfo-ai no longer tests the host by substring");
}

// No old regex, mirrors identical, versions raised.
const MIN = { "qnfo-ai": [5, 36, 11], "personal-api": [4, 15, 1], "qnfo-ops": [2, 51, 1], "radar-hub": [1, 4, 4] };
for (const w of Object.keys(fns)) {
  const src = read(w);
  ok(!/replace\(\/<(script|style|noscript)\[\\s\\S\]\*\?<\\\/(script|style|noscript)>\/gi/.test(src), w + ": no end-tag-exact tag filter left");
  ok(src === read(w, "deployed-current.worker.js"), w + ": deployed-current.worker.js is identical to worker.js");
  const v = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src), m = MIN[w];
  ok(v && [1, 2, 3].every((i) => Number(v[i]) === m[i - 1] ? true : Number(v[i]) > m[i - 1]) && (Number(v[1]) > m[0] || (Number(v[1]) === m[0] && (Number(v[2]) > m[1] || (Number(v[2]) === m[1] && Number(v[3]) >= m[2])))), w + ": VERSION is at least " + m.join("."), v && v[0]);
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
