// LATEX-ESCAPE-BACKSLASH-1 (qnfo-research-exec 0.9.68, agent_issues 2032) offline suite. No network.
// Proves: esc() escapes backslash with the other LaTeX specials in one pass (no double-escaped braces); a title, author, DOI,
// version, date or body text holding \input{...} reaches the .tex as text; bold, italic and link-label text is escaped; a URL
// cannot carry \ { } into \url or \href; Unicode math symbols, Greek letters and sub/superscript digits (also inside *...*) become
// math, \textsuperscript or \textsubscript and survive the escape pass, and touching math spans merge instead of opening $$;
// the writers' LaTeX math ($...$, $$...$$) passes through when latexMathSafe accepts it and is escaped text when it holds a
// file, definition or catcode primitive, ^^, %, an unbalanced brace or a non-math environment; "$5 and $10" stays text.
// Run: node --no-warnings qnfo-research-exec/latex-escape.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const a = src.indexOf("function mdToLatex(md) {"), b = src.indexOf("async function latexCompile(tex) {");
ok(a > 0 && b > a, "the LaTeX builder is found");
const stubs = "var __name = (f) => f, __name2 = __name, __name22 = __name, __name222 = __name, __name2222 = __name, __name22222 = __name;\n";
const L = new Function(stubs + src.slice(a, b) + "\nreturn { mdToLatex, esc, inl, latexMathSafe, escHeading };")();

// 1. esc: one pass, backslash included, braces escaped once
ok(L.esc("\\input{x}") === "\\textbackslash{}input\\{x\\}", "esc turns \\input{x} into text", L.esc("\\input{x}"));
ok(L.esc("a_b & 50% #1 $5 ~ ^") === "a\\_b \\& 50\\% \\#1 \\$5 \\textasciitilde{} \\textasciicircum{}", "esc escapes every special once", L.esc("a_b & 50% #1 $5 ~ ^"));
ok(L.esc("~") === "\\textasciitilde{}" && L.esc("{") === "\\{", "the braces esc inserts are not escaped again");

// 2. a hostile front matter and body never reach TeX as commands
const DANGER = /\\(?:input|include|write|openin|openout|catcode|def|csname|read|immediate|write18|directlua|scantokens)(?![A-Za-z])|\^\^/;
const bodyOf = (tex) => tex.slice(tex.indexOf("\\begin{document}"));
const hostile = [
  "---\ntitle: Hacked \\input{/etc/passwd}\nauthor: A \\write18{rm -rf}\ndoi: 10.5281/\\input{x}\nversion: 1\\def\\x{y}\ndate: 2026-10-06\\input{d}\n---\n\n# Hacked\n\n## Abstract\n\nText \\input{abs} here.\n\n## 1. Intro\n\nBody \\input{b} and **bold \\input{c}** and *it \\catcode`\\@=11* and [label \\input{l}](https://a.org/x) and https://a.org/}\\input{u} end.\n\n- item \\include{i}\n\n| h \\input{t} | v |\n|---|---|\n| \\openin1 | 2 |\n",
  "Math $\\input{m}$ and $$\\def\\a{b}$$ and $^^5cinput{x}$ and $\\begin{filecontents}{f}x\\end{filecontents}$ and $\\csname input\\endcsname{x}$ and (\\input{p})^2 end.",
];
for (const h of hostile) {
  const tex = L.mdToLatex(h);
  ok(!DANGER.test(tex.replace(/^\\documentclass[^\n]*\n/, "").replace(/\\usepackage[^\n]*\n/g, "")), "no file, shell, definition or catcode primitive reaches the .tex", (tex.match(DANGER) || [])[0]);
  ok(tex.indexOf("\\textbackslash{}input") >= 0, "the backslash shows as text", bodyOf(tex).slice(0, 200));
}
const ht = L.mdToLatex(hostile[0]);
ok(/\\title\{Hacked \\textbackslash\{\}input\\\{\/etc\/passwd\\\}\}/.test(ht), "the title is escaped", ht.match(/\\title\{[^\n]*/)[0]);
ok(/\\date\{2026-10-06\\textbackslash\{\}input\\\{d\\\}\}/.test(ht), "a date that is not yyyy-mm-dd is escaped", ht.match(/\\date\{[^\n]*/)[0]);
ok(/\\textbf\{bold \\textbackslash\{\}input\\\{c\\\}\}/.test(ht), "bold text is escaped", ht.match(/\\textbf\{[^\n]{0,40}/));
ok(/\\href\{https:\/\/a\.org\/x\}\{label \\textbackslash\{\}input\\\{l\\\}\}/.test(ht), "a link label is escaped", ht.match(/\\href\{[^\n]{0,60}/));
ok(/\\url\{https:\/\/a\.org\/\}\\\}\\textbackslash\{\}input\\\{u\\\}/.test(ht), "a URL stops before } and \\, which are then escaped", ht.match(/\\url\{[^\n]{0,60}/));

// 3. the symbol and superscript inserts survive as math and \textsuperscript
const sym = L.inl("A 3×10 grid, a × b, x² and y³, T ≈ 5, n ≥ 2, m ≤ 3, 4 − 1.");
ok(sym.indexOf("$3\\times 10$") >= 0, "3x10 is math", sym);
ok(/ \$\\times\$ /.test(sym) && sym.indexOf("\\$\\times\\$") < 0, "a lone x is $\\times$, not escaped dollars", sym);
ok(sym.indexOf("x\\textsuperscript{2}") >= 0 && sym.indexOf("y\\textsuperscript{3}") >= 0 && sym.indexOf("\\textsuperscript\\{") < 0, "superscripts are \\textsuperscript{n}, braces intact", sym);
ok(sym.indexOf("$\\approx$") >= 0 && sym.indexOf("$\\geq$") >= 0 && sym.indexOf("$\\leq$") >= 0, "approx, geq and leq are math", sym);

const emph = L.inl("*T ≈ 5 us* with αβ and T₁, 10⁻⁴ and μ → ∞.");
ok(/\\emph\{T \$\\approx\$ 5 us\}/.test(emph), "a symbol inside *...* is converted before the italic text is lifted out", emph);
ok(emph.indexOf("$\\alpha \\beta$") >= 0 && !/(?<!\\)\$\$/.test(emph), "touching spans merge into one, never $$", emph);
ok(emph.indexOf("T\\textsubscript{1}") >= 0 && emph.indexOf("10\\textsuperscript{-4}") >= 0, "sub- and superscript digits become \\textsubscript and \\textsuperscript", emph);
ok(!/[^\x00-\x7f]/.test(emph), "no Unicode math character is left for pdflatex", emph.match(/[^\x00-\x7f]/g));

const nested = L.inl("**Ratio T² ≫ τ** and [the γ link](https://a.org/x) end.");
ok(!/[\x00-\x08]/.test(nested) && /\\textbf\{Ratio T\\textsuperscript\{2\} \$\\gg\s+\\tau\$\}/.test(nested) && nested.indexOf("{the $\\gamma$ link}") >= 0, "a placeholder inside bold or a link label is restored", nested);

// 4. the writers' LaTeX math passes through when safe
const good = L.inl("The rate is $10^{-4}$ with $T_1 \\approx 5$ us and $$E = \\begin{pmatrix} a & b \\end{pmatrix}$$ per gate.");
ok(good.indexOf("$10^{-4}$") >= 0 && good.indexOf("$T_1 \\approx 5$") >= 0, "inline LaTeX math passes through unchanged", good);
ok(good.indexOf("\\[E = \\begin{pmatrix} a & b \\end{pmatrix}\\]") >= 0, "display math with a matrix passes through as \\[...\\]", good);
ok(L.latexMathSafe("\\alpha + \\beta_{i}^{2} \\le \\frac{1}{2}") && L.latexMathSafe("\\begin{cases} 1 & x>0 \\\\ 0 \\end{cases}"), "ordinary math is accepted");
ok(L.latexMathSafe("G_{\\mathrm{tgt}} \\approx 6.1\\%") && !L.latexMathSafe("a \\\\% c"), "an escaped \\% is a percent sign; a % after a \\\\ line break is a comment");
ok(L.escHeading("Rates at $p = 10^{-3}$ and T ≈ 5 with $\\input{x}$") === "Rates at $p = 10^{-3}$ and T $\\approx$ 5 with \\$\\textbackslash{}input\\{x\\}\\$", "a heading keeps safe math, converts symbols and escapes the rest", L.escHeading("Rates at $p = 10^{-3}$ and T ≈ 5 with $\\input{x}$"));
for (const bad of ["\\input{x}", "\\def\\a{b}", "^^5cinput{x}", "a % comment", "\\begin{verbatim}x\\end{verbatim}", "{unbalanced", "a}b{", "\\makeatletter\\x", "\\csname input\\endcsname", "\\immediate\\write18{ls}", "x@y", "\\IfFileExists{a}{b}{c}"]) ok(!L.latexMathSafe(bad), "refused as math: " + bad);
const money = L.inl("It costs $5 and $10 more.");
ok(money === "It costs \\$5 and \\$10 more.", "currency is text, not math", money);

// 5. the whole document stays well-formed for an ordinary paper
const paper = "---\ntitle: Error rates at 10^-4\nauthor: QNFO\ndate: 2026-10-06\n---\n\n# Error rates\n\n## Abstract\n\nWe bound $p_L \\le 10^{-4}$ for a 3×3 lattice.\n\n## 1. Results\n\nThe logical rate is $$p_L = A (p/p_{th})^{(d+1)/2}$$ with **50% margin** and *T₁ ≈ 5 us*. See [the data](https://zenodo.org/records/1) and https://qnfo.org/a_b.\n\n## References\n\n1. A. Author, Title, 2024.\n";
const pt = L.mdToLatex(paper);
const strip = pt.replace(/\\[{}$%#&_]/g, "");
let depth = 0, neg = false;
for (const ch of strip) { if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth < 0) neg = true; } }
ok(depth === 0 && !neg, "braces balance in the whole .tex", depth);
ok((strip.match(/\$/g) || []).length % 2 === 0, "math delimiters pair up", (strip.match(/\$/g) || []).length);
ok(pt.indexOf("\\textbf{50\\% margin}") >= 0, "a percent sign inside bold no longer comments out the line", pt.match(/\\textbf\{[^\n]{0,30}/));
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
