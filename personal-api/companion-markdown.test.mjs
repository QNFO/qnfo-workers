// personal-api/companion-markdown.test.mjs (PLUS-ME-1): the Talk tab renders Markdown without innerHTML, and the chat knows the owner's taste.
import assert from "node:assert/strict";
import fs from "node:fs";
import * as C from "./companion.js";

const src = fs.readFileSync(new URL("./companion.js", import.meta.url), "utf8");
const m = /const PAGE_V3_SRC = ("(?:[^"\\\n]|\\.)*");/.exec(src);
assert.ok(m, "PAGE_V3_SRC literal found");
const page = JSON.parse(m[1]);
const from = page.indexOf("function inl(box,t)"), to = page.indexOf("function drawChat()");
assert.ok(from > 0 && to > from, "renderMd lives before drawChat");
assert.ok(/else renderMd\(d,m\.content\)/.test(page), "bot messages use renderMd");
assert.ok(!/renderMd[^;]*innerHTML/.test(page.slice(from, to)), "renderMd never writes innerHTML");

// A tiny DOM: enough to render and print the tree.
class N { constructor(tag) { this.tag = tag; this.kids = []; this.attrs = {}; this.text = ""; } appendChild(k) { this.kids.push(k); return k; } }
const el = (tag, a, kids) => { const n = new N(tag); for (const [k, v] of Object.entries(a || {})) { if (k === "text") n.text = v; else n.attrs[k] = v; } for (const k of kids || []) n.appendChild(k); return n; };
const document = { createTextNode: (t) => ({ tag: "#t", text: t, kids: [] }) };
const lib = new Function("el", "document", page.slice(from, to) + "; return renderMd;")(el, document);
const html = (n) => n.tag === "#t" ? n.text.replace(/</g, "&lt;") : "<" + n.tag + (n.attrs.href ? " href=" + n.attrs.href : "") + ">" + n.text + n.kids.map(html).join("") + "</" + n.tag + ">";
const render = (t) => { const root = new N("div"); lib(root, t); return root.kids.map(html).join(""); };

assert.equal(render("Hello **there** and *you*"), "<p>Hello <strong>there</strong> and <em>you</em></p>");
assert.equal(render("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
assert.equal(render("1. a\n2) b"), "<ol><li>a</li><li>b</li></ol>");
assert.equal(render("## Plan\ntext"), "<h4>Plan</h4><p>text</p>");
assert.equal(render("see [site](https://x.nl/a) now."), "<p>see <a href=https://x.nl/a>site</a> now.</p>");
assert.equal(render("go to https://x.nl/a."), "<p>go to <a href=https://x.nl/a>x.nl/a</a>.</p>");
assert.equal(render("`x_y`"), "<p><code>x_y</code></p>");
assert.equal(render("```\nlet a = 1;\n```"), "<pre><code>let a = 1;</code></pre>");
assert.equal(render("> quote"), "<blockquote>quote</blockquote>");
assert.equal(render("| a | b |\n|---|---|\n| 1 | 2 |"), "<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>");
// Script text and non-http links stay text.
assert.equal(render("<script>alert(1)</script>"), "<p>&lt;script>alert(1)&lt;/script></p>");
assert.equal(render("[x](javascript:alert(1))"), "<p>[x](javascript:alert(1))</p>");

// The model is told to ask about interests, write Markdown and save answers; the tool exists and writes a taste vote.
assert.match(C.PERSONA, /Never solicit mood/, "mood rule kept");
assert.match(C.PERSONA, /Get to know their interests/);
assert.match(C.PERSONA, /Markdown/);
const tools = C.companionTools({});
assert.equal(typeof tools.cmp_interest.run, "function");
assert.match(C.TOOL_APPENDIX_LINE, /cmp_interest/);

console.log("companion-markdown ok");
