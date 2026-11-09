// ---- DESIGN-SYSTEM-1 (owner directive 2026-11-09). One design system for every page a person opens on q08.org, qnfo.org or qwav.org.
//
// WHAT. Design tokens (colour, type, spacing, radius, tap size) for a light and a dark theme, the CSS built from them, and the component
// classes every fleet page uses: top bar, page, card, button (primary, secondary, quiet), segmented control, Yes / No / Not sure choices,
// stat tiles, notes, badges, fields, disclosure, tables that scroll instead of crushing, empty states. Plus dsContrast(), so the contrast of
// every text and control colour pair is proven by '_shared/design-system.test.mjs' (WCAG 2.2 AA), and dsLint(), the check that fails a
// page with text under 13 px, a field under 16 px (iOS zooms) or a button under the 44 px tap size.
//
// WHY. Owner, 2026-11-09: "bad UI makes me sad ... the job site and even the markets ... are great examples of bad design ... implement
// design standards ... Don't give me shitty design anywhere." Before this file each worker carried its own inline palette (jobs: 13 px
// muted text and 12 px badges; markets: an unstyled 15 px system page with 8 px buttons and tables that broke words letter by letter on a
// phone). The standard below is written once here and inlined into each page's worker.
//
// THE STANDARD (what every page follows; the test enforces the parts a machine can check).
//  1. One primary action per screen. Exactly one .btn-primary is visible in a view; everything else is secondary or quiet.
//  2. Hierarchy before decoration. A page title, one sentence of status, then the content. Status lines are stat tiles, not run-on text.
//  3. Tap, do not type. Choices are buttons (Yes / No / Not sure, segmented views), never free text or tiny radio buttons. 44 px minimum.
//  4. Progressive disclosure. Secondary tools, links and explanations sit behind a "More" disclosure, not in the top bar.
//  5. Calm. Neutral surfaces, one accent colour, colour carries meaning only for good / warning / bad, generous spacing (8 px scale).
//  6. Readable. 16 px body, 14 px minimum for secondary text, line length under 75 characters for prose, tabular numbers in figures.
//  7. Accessible. WCAG 2.2 AA contrast in both themes, visible focus ring, labels on every field, reduced motion respected.
//  8. Every state designed. Loading, empty and error states say what happens next in one sentence.
//
// HOW TO ADOPT. 1) 'node _shared/inline-design-system.mjs <worker> --anchor "<line prefix>"' once (later runs replace the block in place,
// '--check' reports a stale copy). 2) Put '<style>${DS_CSS}</style>' (or dsHead(title)) in the page head and give <body> class="ds".
// 3) Build with the classes below; page-specific CSS uses the var(--ds-*) tokens, never raw hex. 4) Add the worker to ADOPTERS in
// '_shared/design-system.test.mjs', which renders the page and runs dsLint on it.
//
// RULES FOR EDITING. ES5 style (var and function), no import or export, every name starts with DS_ or ds, no '*' followed by '/' inside a
// comment, no backtick anywhere (the block is inlined into workers that hold their pages in template literals). Version every change in DS_VERSION.
var DS_VERSION = "1.0.0";

var DS_TOKENS = {
  light: {
    bg: "#f5f6f8", surface: "#ffffff", surface2: "#eef1f5", ink: "#15181e", ink2: "#4b5363", line: "#d5dae1", lineStrong: "#7b8494",
    accent: "#1d4ed8", accentHover: "#1e40af", onAccent: "#ffffff", accentSoft: "#e3eaff", accentSoftInk: "#1e3a8a",
    good: "#166534", goodSoft: "#dcfce7", warn: "#854d0e", warnSoft: "#fef3c7", bad: "#b42318", badSoft: "#fee4e2", focus: "#2563eb"
  },
  dark: {
    bg: "#0e1116", surface: "#161a21", surface2: "#1d222b", ink: "#e8ebf0", ink2: "#a4adbb", line: "#2b313c", lineStrong: "#6b7385",
    accent: "#8cb4ff", accentHover: "#a9c6ff", onAccent: "#0a1530", accentSoft: "#1b2a4a", accentSoftInk: "#c7d8ff",
    good: "#6ee7a0", goodSoft: "#12301f", warn: "#f6c453", warnSoft: "#33270d", bad: "#ff9a8f", badSoft: "#3a1715", focus: "#8cb4ff"
  },
  font: "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
  size: { small: 14, body: 16, lead: 18, h3: 17, h2: 20, h1: 26, stat: 26 },
  space: [0, 4, 8, 12, 16, 24, 32, 48],
  radius: { s: 8, m: 12, l: 16, pill: 999 },
  tap: 44,
  maxWidth: 960
};

// The pairs whose contrast the test proves in both themes: [foreground token, background token, minimum ratio].
var DS_CONTRAST_PAIRS = [
  ["ink", "bg", 4.5], ["ink", "surface", 4.5], ["ink", "surface2", 4.5], ["ink2", "bg", 4.5], ["ink2", "surface", 4.5], ["ink2", "surface2", 4.5],
  ["accent", "surface", 4.5], ["accent", "bg", 4.5], ["onAccent", "accent", 4.5], ["onAccent", "accentHover", 4.5], ["accentSoftInk", "accentSoft", 4.5],
  ["good", "surface", 4.5], ["good", "goodSoft", 4.5], ["warn", "surface", 4.5], ["warn", "warnSoft", 4.5], ["bad", "surface", 4.5], ["bad", "badSoft", 4.5],
  ["ink", "warnSoft", 4.5], ["ink", "goodSoft", 4.5], ["ink", "badSoft", 4.5], ["ink", "accentSoft", 4.5],
  ["lineStrong", "surface", 3], ["focus", "surface", 3], ["focus", "bg", 3]
];

function dsLum(hex) {
  var h = String(hex).replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var c = [0, 2, 4].map(function (i) { var v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function dsContrast(a, b) { var x = dsLum(a), y = dsLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

function dsVars(t) {
  var map = { bg: "bg", surface: "surface", surface2: "surface-2", ink: "ink", ink2: "ink-2", line: "line", lineStrong: "line-strong", accent: "accent",
    accentHover: "accent-hover", onAccent: "on-accent", accentSoft: "accent-soft", accentSoftInk: "accent-soft-ink", good: "good", goodSoft: "good-soft",
    warn: "warn", warnSoft: "warn-soft", bad: "bad", badSoft: "bad-soft", focus: "focus" };
  return Object.keys(map).map(function (k) { return "--ds-" + map[k] + ":" + t[k]; }).join(";");
}

var DS_CSS = [
  "/* DESIGN-SYSTEM-1 v" + DS_VERSION + " (_shared/design-system.js) */",
  ":root{color-scheme:light dark;" + dsVars(DS_TOKENS.light) + ";--ds-font:" + DS_TOKENS.font + ";--ds-mono:" + DS_TOKENS.mono + ";--ds-tap:" + DS_TOKENS.tap + "px;--ds-r-s:8px;--ds-r-m:12px;--ds-r-l:16px;--ds-shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08)}",
  "@media (prefers-color-scheme:dark){:root{" + dsVars(DS_TOKENS.dark) + ";--ds-shadow:none}}",
  "*,*::before,*::after{box-sizing:border-box}",
  "body.ds{margin:0;background:var(--ds-bg);color:var(--ds-ink);font:16px/1.55 var(--ds-font);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}",
  ".ds a{color:var(--ds-accent);text-underline-offset:2px}.ds a:hover{color:var(--ds-accent-hover)}",
  ".ds h1,.ds h2,.ds h3{line-height:1.25;margin:0 0 8px;letter-spacing:-.01em}.ds h1{font-size:26px;font-weight:700}.ds h2{font-size:20px;font-weight:650;margin-top:32px}.ds h3{font-size:17px;font-weight:650}",
  ".ds p{margin:0 0 12px}.ds small,.ds-muted{color:var(--ds-ink-2);font-size:14px}",
  ".ds :focus-visible{outline:3px solid var(--ds-focus);outline-offset:2px;border-radius:6px}",
  ".ds-skip{position:absolute;left:-9999px}.ds-skip:focus{left:16px;top:8px;z-index:20;background:var(--ds-surface);padding:8px 12px}",
  ".ds-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
  // top bar and page
  ".ds-top{position:sticky;top:0;z-index:10;background:var(--ds-surface);border-bottom:1px solid var(--ds-line)}",
  ".ds-top-in{max-width:960px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:12px;min-height:60px}",
  ".ds-brand{font-weight:700;font-size:17px;color:var(--ds-ink);text-decoration:none;margin-right:auto;display:flex;align-items:center;gap:8px}",
  ".ds-brand small{font-weight:500}",
  ".ds-main{max-width:960px;margin:0 auto;padding:20px 16px 64px}",
  ".ds-head{margin:4px 0 20px}.ds-head p{color:var(--ds-ink-2);margin:4px 0 0}",
  // buttons
  ".ds .btn,.ds button.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;min-width:44px;padding:10px 16px;border-radius:var(--ds-r-m);border:1px solid var(--ds-line-strong);background:var(--ds-surface);color:var(--ds-ink);font:600 15px/1.2 var(--ds-font);cursor:pointer;text-decoration:none;transition:background .15s,border-color .15s}",
  ".ds .btn:hover{background:var(--ds-surface-2)}.ds .btn:disabled,.ds .btn[aria-disabled=true]{opacity:.55;cursor:not-allowed}",
  ".ds .btn.btn-primary{background:var(--ds-accent);border-color:var(--ds-accent);color:var(--ds-on-accent)}.ds .btn.btn-primary:hover{background:var(--ds-accent-hover);border-color:var(--ds-accent-hover);color:var(--ds-on-accent)}",
  ".ds .btn.btn-quiet{background:transparent;border-color:transparent;color:var(--ds-accent)}.ds .btn.btn-quiet:hover{background:var(--ds-accent-soft)}",
  ".ds .btn.btn-block{width:100%}.ds .btn.btn-lg{min-height:52px;font-size:16px;padding:12px 20px}",
  ".ds-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}",
  // segmented control (views)
  ".ds-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;padding:4px;background:var(--ds-surface-2);border-radius:var(--ds-r-m)}",
  "@media (max-width:560px){.ds-seg{grid-auto-flow:row;grid-template-columns:1fr 1fr}}",
  ".ds-seg button{min-height:44px;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:var(--ds-ink-2);font:600 15px var(--ds-font);cursor:pointer;line-height:1.2}",
  ".ds-seg button[aria-pressed=true],.ds-seg button[aria-selected=true]{background:var(--ds-surface);color:var(--ds-ink);box-shadow:var(--ds-shadow)}",
  // Yes / No / Not sure
  ".ds-choices{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}",
  ".ds-choices button{min-height:56px;border-radius:var(--ds-r-m);border:1px solid var(--ds-line-strong);background:var(--ds-surface);color:var(--ds-ink);font:600 16px var(--ds-font);cursor:pointer}",
  ".ds-choices button:hover{border-color:var(--ds-accent);background:var(--ds-accent-soft)}",
  ".ds-choices button[aria-pressed=true]{background:var(--ds-accent);border-color:var(--ds-accent);color:var(--ds-on-accent)}",
  ".ds-options{display:grid;gap:8px;margin-top:12px}.ds-options button{text-align:left;min-height:56px;padding:12px 16px;border-radius:var(--ds-r-m);border:1px solid var(--ds-line-strong);background:var(--ds-surface);color:var(--ds-ink);font:16px/1.4 var(--ds-font);cursor:pointer}",
  ".ds-options button:hover{border-color:var(--ds-accent);background:var(--ds-accent-soft)}.ds-options button b{display:block;font-weight:650}",
  ".ds-q{font-size:18px;font-weight:650;line-height:1.35;margin:6px 0}.ds-step{font-size:14px;color:var(--ds-ink-2);font-weight:600;letter-spacing:.02em}",
  ".ds-progress{height:6px;border-radius:99px;background:var(--ds-surface-2);overflow:hidden;margin:8px 0 4px}.ds-progress>i{display:block;height:100%;background:var(--ds-accent);border-radius:99px}",
  // cards, notes, badges
  ".ds-card{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-l);padding:16px;margin:0 0 12px;box-shadow:var(--ds-shadow)}",
  ".ds-card-title{font-size:17px;font-weight:650;line-height:1.35;margin:0}",
  ".ds-meta{color:var(--ds-ink-2);font-size:14px;margin-top:4px}",
  ".ds-note{border-radius:var(--ds-r-m);padding:12px 14px;margin:0 0 12px;background:var(--ds-accent-soft);color:var(--ds-ink);font-size:15px}",
  ".ds-note-warn{background:var(--ds-warn-soft)}.ds-note-good{background:var(--ds-good-soft)}.ds-note-bad{background:var(--ds-bad-soft)}",
  ".ds-badge{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:700;line-height:1;padding:5px 9px;border-radius:99px;background:var(--ds-surface-2);color:var(--ds-ink);white-space:nowrap}",
  ".ds-badge-accent{background:var(--ds-accent-soft);color:var(--ds-accent-soft-ink)}.ds-badge-good{background:var(--ds-good-soft);color:var(--ds-good)}.ds-badge-warn{background:var(--ds-warn-soft);color:var(--ds-warn)}.ds-badge-bad{background:var(--ds-bad-soft);color:var(--ds-bad)}",
  ".ds-good{color:var(--ds-good)}.ds-warn{color:var(--ds-warn)}.ds-bad{color:var(--ds-bad)}",
  // stats
  ".ds-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:0 0 16px}",
  ".ds-stat{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-m);padding:12px 14px}",
  ".ds-stat .k{font-size:14px;color:var(--ds-ink-2)}.ds-stat .v{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2;margin-top:2px}",
  // fields
  ".ds input:not([type=radio]):not([type=checkbox]),.ds select,.ds textarea{font:16px/1.4 var(--ds-font);color:var(--ds-ink);background:var(--ds-surface);border:1px solid var(--ds-line-strong);border-radius:var(--ds-r-s);padding:10px 12px;min-height:44px;max-width:100%}",
  ".ds textarea{width:100%}.ds label{font-size:15px}",
  ".ds-field{display:grid;gap:4px;margin:0 0 12px}.ds-field>span{font-size:14px;font-weight:600;color:var(--ds-ink-2)}",
  // disclosure
  ".ds details.ds-more{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-l);margin:0 0 12px}",
  ".ds details.ds-more>summary{list-style:none;cursor:pointer;min-height:52px;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;font-weight:650}",
  ".ds details.ds-more>summary::-webkit-details-marker{display:none}.ds details.ds-more>summary::after{content:'+';font-size:22px;color:var(--ds-ink-2);font-weight:400}",
  ".ds details.ds-more[open]>summary::after{content:'\\2212'}.ds details.ds-more>.ds-more-body{padding:0 16px 16px}",
  // tables: scroll, never crush
  ".ds-table-wrap{overflow-x:auto;border:1px solid var(--ds-line);border-radius:var(--ds-r-m);background:var(--ds-surface)}",
  ".ds-table{width:100%;border-collapse:collapse;font-size:15px}.ds-table th{font-size:13px;font-weight:650;color:var(--ds-ink-2);text-transform:uppercase;letter-spacing:.04em;text-align:left;background:var(--ds-surface-2)}",
  ".ds-table th,.ds-table td{padding:10px 12px;border-bottom:1px solid var(--ds-line);vertical-align:top}.ds-table tr:last-child td{border-bottom:0}",
  ".ds-table .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.ds-table td.title{min-width:200px}",
  // lists of items as cards on phones
  ".ds-rows{display:grid;gap:8px}.ds-row{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-m);padding:12px 14px}",
  ".ds-row .main{min-width:0;flex:1}.ds-row .side{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}",
  // empty and loading
  ".ds-empty{text-align:center;padding:32px 16px;color:var(--ds-ink-2);border:1px dashed var(--ds-line-strong);border-radius:var(--ds-r-l)}",
  ".ds-empty b{display:block;color:var(--ds-ink);font-size:17px;margin-bottom:4px}",
  ".ds pre{white-space:pre-wrap;background:var(--ds-surface-2);border-radius:var(--ds-r-s);padding:12px;font:14px/1.5 var(--ds-mono);overflow-x:auto}",
  ".ds hr{border:0;border-top:1px solid var(--ds-line);margin:24px 0}",
  "@media (max-width:640px){.ds-hide-sm{display:none!important}.ds h1{font-size:23px}.ds-top-in{padding:8px 12px}}",
  "@media (prefers-reduced-motion:reduce){.ds *{transition:none!important;animation:none!important}}"
].join("\n");

function dsEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// The head of a page: charset, viewport, title, description, theme colours and the design system CSS. extraCss uses var(--ds-*) only.
function dsHead(title, description, extraCss) {
  return "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><title>" + dsEsc(title) + "</title>"
    + (description ? "<meta name=\"description\" content=\"" + dsEsc(description) + "\">" : "")
    + "<meta name=\"theme-color\" content=\"" + DS_TOKENS.light.surface + "\" media=\"(prefers-color-scheme: light)\"><meta name=\"theme-color\" content=\"" + DS_TOKENS.dark.surface + "\" media=\"(prefers-color-scheme: dark)\">"
    + "<style>" + DS_CSS + (extraCss ? "\n" + extraCss : "") + "</style>";
}

// Machine-checkable parts of the standard, run on a rendered page. Returns a list of problems (empty when the page passes).
function dsLint(html) {
  var out = [], m, re;
  if (String(html).indexOf("DESIGN-SYSTEM-1 v") < 0) out.push("page does not include DS_CSS");
  if (!/<body[^>]*class="[^"]*\bds\b/.test(html)) out.push("body is missing class=\"ds\"");
  if (!/name="?viewport"?/.test(html)) out.push("no viewport meta");
  re = /font(?:-size)?\s*:\s*(?:[0-9]+\s+)?([0-9.]+)px/g;
  while ((m = re.exec(html))) { if (+m[1] < 13) out.push("text under 13px: " + m[0]); }
  re = /min-height\s*:\s*([0-9.]+)px/g;
  var css = String(html).split("<style>").slice(1).map(function (s) { return s.split("</style>")[0]; }).join("\n");
  re = /(button|\.btn)[^{}]*\{[^}]*min-height\s*:\s*([0-9.]+)px/g;
  while ((m = re.exec(css))) { if (+m[2] < 40) out.push("button under the tap size: " + m[0].slice(0, 80)); }
  if (/style="[^"]*#[0-9a-fA-F]{3,6}/.test(html)) out.push("inline style with a raw hex colour (use var(--ds-*))");
  var prim = (html.match(/class="[^"]*\bbtn-primary\b/g) || []).length;
  if (prim > 1) out.push("more than one primary button in the static page (" + prim + ")");
  return out;
}
