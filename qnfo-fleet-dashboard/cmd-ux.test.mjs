// CMD-UX-1 and CMD-WRITE-SCOPE-1 (owner 2026-11-14, screenshot of fleet.qnfo.org/cmd: a 15-character-wide textarea, a chip called "lee", monospace answers, and
// "(the code session returned no text)" for "most popular papers last week"; "doesn't function like Claude Code ... full read/write/execute").
// Proves: the form stacks (textarea on its own row at 16 px, actions below, 44 px tap targets, 14 px secondary text); no chip is an unexplained word; the answer is rendered by a
// DOM-only markdown renderer that cannot inject markup; steps read as words with a count; an owner turn starts the CodeSession in the write scope only with a fresh code
// (stepup) and read-only otherwise, and the page says which; the old empty-answer placeholder is gone.
// Run: node --no-warnings qnfo-fleet-dashboard/cmd-ux.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const i0 = src.indexOf("var CMD_JS = ");
const js = vm.runInNewContext(src.slice(i0 + "var CMD_JS = ".length, src.indexOf('"; // standards-ok', i0) + 1)).replace("HOLDER", "true");
const cssStart = src.indexOf("var CMD_CSS = "), css = src.slice(cssStart, src.indexOf("function cmdPanelHtml", cssStart));
const htmlStart = src.indexOf("function cmdPanelHtml"), html = src.slice(htmlStart, src.indexOf("\n}\n", htmlStart));

// ---- layout and design standard
ok(/#cmd #ctext\{[^}]*width:100%[^}]*min-height:88px[^}]*font:16px/.test(css), "the textarea is full width, at least 88 px tall, 16 px text");
ok(/#cmd\.cmd form\{display:block\}/.test(css) && /<textarea id="ctext"[^>]*><\/textarea><div class="crow">/.test(html), "the textarea is on its own row; the actions sit below it");
ok(!/class="pr0"/.test(html), "no prompt glyph steals width from the field");
ok(/#cmd\.cmd button\{min-height:44px/.test(css) && /#cmd \.chips button\{min-height:44px;font-size:14px/.test(css), "buttons and chips are 44 px tall, chips 14 px");
ok(/#cmd \.cmeta\{font-size:14px\}/.test(css) && /#cmd \.co \.why\{font-size:14px\}/.test(css), "secondary text is at least 14 px");
const chips = [...html.matchAll(/data-c="([^"]*)">([^<]*)</g)].map((m) => ({ cmd: m[1], label: m[2] }));
ok(chips.length >= 8 && chips.every((c) => c.label.length >= 4 && /^[A-Z]/.test(c.label)), "every chip has a capitalised, readable label", chips.map((c) => c.label));
ok(chips.some((c) => /papers/i.test(c.label) && /\?$/.test(c.cmd)), "a chip asks the analytics question that failed on the screenshot");
ok(chips.some((c) => c.cmd === "cf help" && /Lee/.test(c.label) && /Cloudflare/.test(c.label)), "the Lee chip says who Lee is");
ok(!/\(the code session returned no text\)/.test(js), "the empty-answer placeholder is gone from the page script");

// ---- the renderer, run for real in a small DOM
class El {
  constructor(tag) { this.tag = tag; this.tagName = String(tag).toUpperCase(); this.children = []; this.className = ""; this._text = ""; this.style = {}; this.attrs = {}; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this._text = String(v); this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener() {}
  get firstChild() { return this.children[0] || null; }
}
const byId = {};
const doc = { getElementById: (id) => byId[id] || (byId[id] = new El("div")), createElement: (t) => new El(t), createTextNode: (t) => { const e = new El("#text"); e._text = t; return e; }, addEventListener() {}, querySelector: () => null, activeElement: null };
byId.cform = new El("form"); byId.cmd = new El("div"); byId.ctext = new El("textarea"); byId.cout = new El("div"); byId.cgo = new El("button"); byId.cwho = new El("span"); byId.cchips = new El("div"); byId.cscope = new El("span");
const win = { document: doc, sessionStorage: { getItem() { return null; }, setItem() {} }, location: { href: "" }, setTimeout, fetch: async () => ({ json: async () => ({}) }), navigator: {}, MediaRecorder: undefined };
win.window = win;
// expose the page's own helpers by appending a hook to the IIFE
const hooked = js.replace(/\}\)\(\);\s*$/, ";window.__md=md;window.__friendly=friendly;window.__scope=scopeBadge;window.__copy=copyBtn;})();");
vm.runInNewContext(hooked, win);
ok(typeof win.__md === "function" && typeof win.__friendly === "function" && typeof win.__scope === "function", "the page exposes its renderer, step names and scope badge");

const kinds = (n) => n.children.map((c) => c.tag + (c.className ? "." + c.className : ""));
const doc1 = win.__md("Top papers:\n\n1. **Paper A** - 51 views\n2. Paper B - 49 views\n\n- a `code` note\n\n## Next\nplain line");
ok(kinds(doc1).join(",") === "p,ol,ul,div.h,p", "a paragraph, a numbered list, a bullet list, a heading and a paragraph render as such", kinds(doc1));
ok(doc1.children[1].children.length === 2 && doc1.children[1].children[0].children.some((c) => c.tag === "strong"), "bold inside a list item becomes a strong element");
const tbl = win.__md("| Paper | Views |\n|---|---|\n| A | 51 |\n| B | 49 |");
ok(tbl.children[0].className === "tw" && tbl.children[0].children[0].tag === "table" && tbl.children[0].children[0].children.length === 3, "a pipe table renders as a scrolling table with a header and two rows", kinds(tbl));
const fence = win.__md("```\nSELECT 1\nFROM x\n```");
ok(fence.children[0].tag === "pre" && /SELECT 1/.test(fence.children[0].textContent) && /FROM x/.test(fence.children[0].textContent), "a code fence renders as a code block");
const evil = win.__md("<img src=x onerror=alert(1)> **bold** <script>alert(2)</script>");
const flat = (n) => [n.tag, ...n.children.flatMap(flat)];
ok(!flat(evil).some((t) => t === "img" || t === "script") && /<img src=x/.test(evil.textContent) && /<script>/.test(evil.textContent), "markup in a model answer stays text: no element is made from it");
ok(!/\.innerHTML\s*=\s*[^'"]*md\(|innerHTML=t\b/.test(js.split("function md(")[1].split("function copyBtn")[0]), "the renderer never writes innerHTML");
ok(win.__friendly("fleet_sql") === "Reading the database" && win.__friendly("some_new_tool") === "some new tool", "step names read as words, an unknown tool reads as its name without underscores");
win.__scope("write");
ok(/Can read, change and run/.test(byId.cscope.textContent), "the badge says when the session can change things");
win.__scope("read");
ok(/Read-only/.test(byId.cscope.textContent) && /Allow changes/.test(byId.cscope.textContent), "the badge says read-only and offers Allow changes");

// ---- the scope the owner's turn starts in
const call = src.slice(src.indexOf("const wantWrite = "), src.indexOf("const wantWrite = ") + 520);
ok(/owner\.loop \|\| owner\.legacy \|\| \(owner\.session && owner\.session\.stepup\)/.test(call), "write scope only for the loop token, the legacy key or a session with a fresh code");
ok(/cmdCodeSessionFetch\(env, sessionPath, \{ text: text \}, wantWrite \? "write" : "read"\)/.test(call), "the session start carries the scope");
ok(/headers: scope === "write" \? \{ "content-type": "application\/json", "x-agent-scope": "write" \}/.test(src), "the write scope reaches qnfo-agents as x-agent-scope: write");
ok(/kind: "stream", id: logId, session_id: session\.session_id, turn: session\.turn, scope: wantWrite \? "write" : "read"/.test(src), "the answer tells the page which scope the session got");
ok(/sid='';try\{sessionStorage\.removeItem\('fleetcmdsid'\)\}catch\(e\)\{\}scopeBadge\('write'\)/.test(js), "a fresh code starts the next turn in a new session, so it gets the write scope");

console.log("cmd-ux: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
