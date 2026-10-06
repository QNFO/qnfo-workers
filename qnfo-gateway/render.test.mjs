// MATH-DELIM-1 / TABLE-SEP-1 (qnfo-gateway 3.8.2): renderer regressions found by the full-corpus sweep of 2026-10-02.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "gwr-"));
writeFileSync(join(dir, "w.mjs"), readFileSync(join(here, "worker.js"), "utf8") + "\nexport { renderMarkdown, lpStructure, lpDoi, renderDefectCount, subscribeSource, renderReadingHTML };\n");
const { renderMarkdown, lpStructure, lpDoi, renderDefectCount, subscribeSource, renderReadingHTML } = await import(pathToFileURL(join(dir, "w.mjs")).href);
let fails = 0;
const ok = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) { fails++; if (x) console.log("   ", JSON.stringify(x).slice(0, 400)); } };
const math = (h) => (h.replace(/<span class="usd">\$<\/span>/g, "\u00a4").replace(/<[^>]+>/g, " ").match(/\$[^$]+\$/g) || []);
let h = renderMarkdown("The claim: **anyons are not particles in $\\mathbb{R}$$^3$ but patterns.**\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n## Next");
ok(/<table>/.test(h) && /<h2>Next<\/h2>/.test(h) && math(h).includes("$\\mathbb{R}^3$"), "adjacent inline formulas no longer open display math (the table and heading after them render)", h);
h = renderMarkdown("Spend: **$1,032.08 total** across 184 days, a mean of $5.61 per day.");
ok(math(h).length === 0 && /<strong>/.test(h) && (h.match(/<span class="usd">\$<\/span>/g) || []).length === 2, "currency is not math, and literal dollars cannot be paired by MathJax", h);
h = renderMarkdown("Bound: $\\leq$0.75 and $x$ and $ f: \\mathbb{Z}_p \\to \\mathbb{Q}_p $ and $2^n$ states.");
ok(math(h).length === 4, "real formulas survive: followed by a digit, spaces inside, starting with a digit", math(h));
h = renderMarkdown("The ratios $m_\\mu/m_e \\approx\n207$ and $m_\\tau/m_e$ are close.");
ok(math(h).length === 2, "a formula broken across a line still renders", math(h));
h = renderMarkdown("| # | Objection | Grade |\n|:--|:----------|:------|\n| 1 | Chronological | Partial |");
ok(/<table>/.test(h) && /<th>#<\/th>/.test(h) && !/<h1>/.test(h), "short GFM delimiter rows (|:--|) make a table; a '#' header cell is not a heading", h);
h = renderMarkdown("Price \\$5 and more.");
ok(!math(h).length && /usd/.test(h), "an escaped dollar stays literal", h);
const st = lpStructure("<h1>1. What this is</h1><p>x</p><h2>1.1 Part</h2><p>y</p><h1>2. Next</h1>");
ok(!/<h1/.test(st.html) && st.toc.length === 3 && st.toc[0].lv === 2 && st.toc[1].lv === 3, "papers that use # for sections get h2 sections in the contents", st.toc);
ok(lpDoi("pending") === null && lpDoi("https://doi.org/10.5281/zenodo.21758752") === "10.5281/zenodo.21758752" && lpDoi("10.5281/zenodo.1") === "10.5281/zenodo.1" && lpDoi("") === null, "DOI-HYGIENE-1: only real DOIs are shown (\"pending\" and URL forms handled)");
h = renderMarkdown("Code:\n[](#cb1-1)import numpy as np\n[](#cb1-2)var = np.sum(prob * dist**2)\n[](#cb1-3)return var\n\nAfter.");
ok(/<pre><code>/.test(h) && /dist\*\*2/.test(h) && !/#cb1/.test(h) && !/<strong>/.test(h), "PANDOC-CODE-1: anchored code lines become one code block; ** stays an operator", h);
h = renderMarkdown("# **Appendix A: Formal Proof of Emergent Temporal\ndynamics**\n\nText.");
ok(/<h1><strong>Appendix A: Formal Proof of Emergent Temporal dynamics<\/strong><\/h1>/.test(h), "HEADING-WRAP-1: a heading wrapped onto the next line is joined", h);
// RENDER-FIX-3 (3.9.1)
h = renderMarkdown("Sample $s \\xleftarrow{\\$} \\mathbb{Z}_p^n$ uniformly, a sub-\\$500K program, and $x$.");
ok(math(h).length === 2 && math(h)[0].indexOf("xleftarrow") > 0 && (h.match(/usd/g) || []).length === 1, "RENDER-FIX-3: an escaped dollar inside a formula or before a number is never a delimiter", math(h));
h = renderMarkdown("Code:\n\n```python\nx = 1  # a comment\n```\n\nAfter.");
ok(!/<h1>/.test(h) && /x = 1  # a comment/.test(h), "RENDER-FIX-3: a comment in fenced code stays on its line (no heading)", h);
h = renderMarkdown("Code:\n[](#cb1-1)rho = c**5\n[](#cb1-2)        # Store state\n[](#cb1-3)return rho\n\nAfter.");
ok(!/<h1>/.test(h) && (h.match(/<pre>/g) || []).length === 1 && /# Store state/.test(h), "RENDER-FIX-3: a comment in pandoc-anchored code stays in the one code block", h);
h = renderMarkdown("| Lepton | Crossing # $n$ |\n|:--|:--|\n| e | 0 |");
ok(/<table>/.test(h) && !/<h1>/.test(h) && /<td>e<\/td>/.test(h), "RENDER-FIX-3: a '#' inside a table header cell does not split the row into a heading", h);
h = renderMarkdown("the model operates. ######\n**1.3.1.1. Ptolemy's Model's Paradoxical\nSuccess** A detailed recounting.\n\n#\n## Changelog\n\n- v2");
ok(/<h6>1\.3\.1\.1\. Ptolemy.s Model.s Paradoxical Success<\/h6>/.test(h) && /<p>A detailed recounting\.<\/p>/.test(h) && /<h2>Changelog<\/h2>/.test(h) && !/<p>#/.test(h) && !/\*\*/.test(h), "RENDER-FIX-3: a heading marker at the end of a line takes the bold line after it; a bare marker is dropped", h);
h = renderMarkdown("- **Experimental tests of consciousness\nmeasurement.** While controversial.\n- Next");
ok((h.match(/<li>/g) || []).length === 2 && /<strong>Experimental tests of consciousness measurement\.<\/strong>/.test(h), "RENDER-FIX-3: list items take lazy continuation lines", h);
h = renderMarkdown("**5.5.2.2 A New Lens: an *additional, orthogonal lens* for biology.** Text ***both***.");
ok(/<strong>5\.5\.2\.2 A New Lens: an <em>additional, orthogonal lens<\/em> for biology\.<\/strong>/.test(h) && /<strong><em>both<\/em><\/strong>/.test(h) && !/\*/.test(h), "RENDER-FIX-3: bold containing italic, and bold italic", h);
h = renderMarkdown("Let \\(D_0\n= \\{\\bot\\}\\) be flat.");
ok(math(h).length === 1 && math(h)[0] === "$D_0 = \\{\\bot\\}$", "RENDER-FIX-3: \\( ... \\) may wrap onto the next line", math(h));
h = renderMarkdown("**Table 2: Cost**\n\nScenario |\nFab Yield |\nCost (\\$M) |\n|\n\nStandard |\n95% |\n\\$10.53 |\n\n**Topological\n(Baseline)** |\n**50%** |\n**\\$1.00** |\n\nAfter the table.");
ok(/<table><thead><tr><th>Scenario<\/th><th>Fab Yield<\/th><th>Cost/.test(h) && (h.match(/<tr>/g) || []).length === 3 && /<strong>Topological \(Baseline\)<\/strong>/.test(h) && /<p>After the table\.<\/p>/.test(h) && !/\|/.test(h), "FLAT-TABLE-1: docx tables flattened into 'cell |' paragraphs become tables", h);
h = renderMarkdown("The construction proceeds through inverse limits: |\n\nNext paragraph.");
ok(!/<table>/.test(h) && /inverse limits:<\/p>/.test(h), "FLAT-TABLE-1: a one-cell row is prose without its stray pipe", h);
// RENDER-HEALTH-1, SUBSCRIBE-SOURCE-1, LIVING-PAPERS-PAGE-1 (3.9.2)
ok(renderDefectCount(renderMarkdown("## A\n\nText with **bold** and $x$ and a [ref](https://x).\n\n| a | b |\n|---|---|\n| 1 | 2 |")) === 0, "RENDER-HEALTH-1: a clean page has no defects");
ok(renderDefectCount("<p>raw **bold and ## Heading and | --- | and $x</p>") === 4, "RENDER-HEALTH-1: each of the four raw-Markdown tests counts");
ok(renderDefectCount("<pre><code>x = r**2  # comment</code></pre><p>cost <span class=\"usd\">$</span>5 and (r**2)</p>") === 0, "RENDER-HEALTH-1: code, currency and exponent operators are not defects");
const req = (ref) => new Request("https://papers.qnfo.org/api/subscribe", { method: "POST", headers: ref ? { Referer: ref } : {} });
ok(subscribeSource(req("https://papers.qnfo.org/reading?utm_source=bluesky&utm_medium=social&utm_campaign=living-papers"), { source: "papers" }) === "papers|/reading|living-papers", "SUBSCRIBE-SOURCE-1: form, page and campaign are recorded");
ok(subscribeSource(req(null), { source: "papers" }) === "papers", "SUBSCRIBE-SOURCE-1: without a Referer the form label alone, as before");
ok(subscribeSource(req("https://papers.qnfo.org/x?utm_campaign=a%22%3Cb"), {}).length <= 80 && !/[<"]/.test(subscribeSource(req("https://papers.qnfo.org/x?utm_campaign=a%22%3Cb"), {})), "SUBSCRIBE-SOURCE-1: the campaign is sanitised and the value fits the column");
const rd = await renderReadingHTML().text();
ok(/Research papers you can actually read/.test(rd) && /href="\/papers\/joules-per-solution-metric"/.test(rd) && /not peer reviewed/.test(rd) && /canonical" href="https:\/\/papers\.qnfo\.org\/reading"/.test(rd), "LIVING-PAPERS-PAGE-1: /reading states the format, the sample, the limits and its canonical URL", rd.slice(0, 300));
console.log(fails + " failure(s)");
// MATH-TYPESET-1 (3.9.3): plain-text/Unicode pseudo-math is typeset at render time.
h = renderMarkdown("The central charge satisfies c = 1/2 and the modular data obey S\u00b2 = (ST)\u00b3 with \u03b1\u2081 \u2192 \u221a2 here.");
ok(math(h).length >= 1 && !/S\u00b2/.test(h), "Unicode pseudo-math becomes $...$", h);
h = renderMarkdown("Plain prose with no formulas, a price of 5 dollars, and the word state-of-the-art.");
ok(math(h).length === 0, "prose is left alone", h);
h = renderMarkdown("Already $x_1^2$ typeset and `code a_b^2` stay.");
ok(math(h).length === 1 && /<code>code a_b\^2<\/code>/.test(h), "existing math and code spans untouched", h);
ok(renderDefectCount("<p>a_1 b_2 c_3 d_4 e_5</p>") >= 1, "defect counter flags residual pseudo-math");
ok(renderDefectCount("<p>$a_1$ and $b_2$ and $c_3$ ok</p>") === 0, "defect counter ignores typeset math");
// 3.9.7: fixes from the live-corpus check (467 papers) of the re-applied normalizer, and MATH-ESCAPE-1 (#1935).
h = renderMarkdown("**Step 1:** D_C\u00b2 = 1 + 1 = 2, and N_D = 63 \u00d7 7 = **441 detectors**.");
ok(/<strong>Step 1:<\/strong>/.test(h) && /<strong>441 detectors<\/strong>/.test(h) && !math(h).some((x) => /\*/.test(x)), "bold markers stay outside pseudo-math", h);
h = renderMarkdown("The ratio D_D/D_C = \u221a(3/7) holds.");
ok(math(h).includes("$D_{D}/D_{C} = \\sqrt{3/7}$") && !/\$\$/.test(h), "a formula starting with D stays inline (the display flag no longer eats the D)", h);
h = renderMarkdown("The \u211a-as-base-field thesis and the \u211a-vs-\u211d question.");
ok(!math(h).some((x) => /as|vs/.test(x)), "prose compounds are not typeset", h);
ok(renderDefectCount("<p>noise_sigma and curve_fit and MODEL_HTS_45 and run_simulation(x)</p>") === 0, "identifiers are not residual pseudo-math");
h = renderMarkdown("Constant [\\\\(\\alpha\\\\)]{.math .inline} and ratio [\\\\(m\\_\\mu / m_e\\\\)]{.math .inline}.\n\n[\\\\\\[\\frac{N\\^{(X)}}{N} \\in \\mathbb{Q}\\^+\\\\\\]]{.math .display}\n\nAt a \\\\(\\approx\\\\) 0.5.");
ok(!/\{\.math/.test(h) && math(h).includes("$\\alpha$") && math(h).includes("$m_\\mu / m_e$") && h.includes("$$\\frac{N^{(X)}}{N} \\in \\mathbb{Q}^+$$") && h.includes("At a $\\approx$ 0.5"), "pandoc math spans and \\\\( \\\\) become math with markdown escapes removed", h);
h = renderMarkdown("Planck units (\u210f = c = k\\_B = 1) and $\\tilde{x}$\\_i here; a \\| b.");
ok(!/\\_|\\\|/.test(h.replace(/\$[^$]*\$/g, "")) && math(h).includes("${\\tilde{x}}_{i}$"), "markdown escapes print the character; a script after a formula joins it", h);
h = renderMarkdown("$$\n\\begin{CD} A @>f>> B \\end{CD}\n$$\n\n\\[\n$x = 1$\n\\]");
ok(/@&gt;f&gt;&gt;/.test(h) && !/\\gt/.test(h) && /\$\$\s*x = 1\s*\$\$/.test(h), "amsCD arrows survive and nested delimiters inside display math are dropped", h);

// MATH-RESIDUE-2 (gateway 3.9.8, #2023): shapes the 2026-10-06 sweep counted as residue on 68 pages.
h = renderMarkdown("Success after N attempts is 1 − (1−p)^N; Rates (31/3)^4 and 3p_Z hold, against pi^2/6.");
ok(math(h).includes("$1 - (1-p)^{N}$") && math(h).includes("$(31/3)^{4}$") && math(h).includes("$3p_{Z}$") && math(h).includes("$\\pi ^{2}/6$") && renderDefectCount(h) === 0, "a parenthesised base, a numeric coefficient and pi^ are typeset", math(h));
h = renderMarkdown("entropy = −0.1·log₂(0.1) and H = (ℏω_q/2)σ_z here.");
ok(math(h).includes("$-0.1\\cdot \\log_{2}(0.1)$") && math(h).includes("$H = (\\hbar \\omega _{q}/2)\\sigma _{z}$"), "a function with a Unicode script and hbar are typeset", math(h));
h = renderMarkdown("QuiX's Si₃N₄ platform, Ca₉(PO₄)₆ crystals, a SiN film, the Type III₁ factor and Z₂.");
ok(math(h).includes("$\\mathrm{Si}_{3}\\mathrm{N}_{4}$") && math(h).includes("$\\mathrm{Ca}_{9}(\\mathrm{P}\\mathrm{O}_{4})_{6}$") && math(h).includes("$Z_{2}$") && !math(h).some((x) => /SiN/.test(x)), "formula tokens are typeset upright; a word with no subscript is not", math(h));
h = renderMarkdown("the Clifford algebra {γ_i, γ_j} = 2δ_ij, i.e., latency × (depth × t_g) = 10 here.");
ok(math(h).includes("$\\gamma _{i}, \\gamma _{j}$") && math(h).includes("$2\\delta _{ij}$") && math(h).some((x) => /t_\{g\}/.test(x)), "a run with unbalanced brackets is split and its parts typeset", math(h));
h = renderMarkdown("P = C(5,1)²p_Zp₁ = 25.");
ok(!math(h).some((x) => /_\\mathrm\{[^}]*\}_/.test(x)), "no double subscript reaches the page (pmScriptsOk counts a command's argument)", math(h));
h = renderMarkdown("Z[ϕ_<] = ∫*{Λ < |k|} Dϕ*> exp(x) and At $\\tau$*: $- \\nabla S(\\tau *) = 0$ here.");
ok(!math(h).some((x) => /\*\\gt|\\int \*/.test(x)), "a lone * next to a relation or brace stays an emphasis marker", math(h));
// RENDER-HEALTH-PRECISION-1 (3.11.1, agent_issues 2023): the four false-positive classes measured on 2026-10-06.
ok(renderDefectCount("<p>Bi\u2082Sr\u2082CaCu\u2082O\u2088\u208a\u03b4 and <em>x</em>\u2080 + <em>v</em>\u2080<em>t</em> and m\u00b2 and n\u00b3.</p>") === 0, "PRECISION-1: correct Unicode sub- and superscripts are not residue");
ok(renderDefectCount("<p>Inline <span class=\"math\">$C_S = \\$0$</span>M and $a_b$ and $c_d$ and text.</p>") === 0, "PRECISION-1: an escaped dollar inside math does not shift the pairing");
ok(renderDefectCount("<p>See https://x.org/Intro_to_Boundary_Logic_v2.pdf and https://y.org/a_b_c_d.html for x_y.</p>") === 0, "PRECISION-1: URLs are not residue");
ok(renderDefectCount("<p>Here y_true, t_gate, d_practical and I_syn are names.</p>") === 0, "PRECISION-1: a one-letter stem with a word subscript is a name");
ok(renderDefectCount("<p>Bound (p/p_th)^(d/2) and zeta(s) = (1 - p^{-s})^{-1} and x^2.</p>") === 1, "PRECISION-1: real raw math still counts (p_th, ^( and ^{ remain residue)");
ok(renderDefectCount("<p>A x_1 and y_2 and z^3 left raw.</p>") === 1, "PRECISION-1: short raw subscripts still count");

// MATH-RESIDUE-3 (3.11.2, agent_issues 2023): paren-wrapped bases with scripts, a run that needs its first "(", unit powers.
h = renderMarkdown("The logical error scales as (p/p_th)^(d/2), a modest gain; the identity (−1)^{2s} holds; size (p+1)p^{n−1} each.");
ok(math(h).includes("$(p/p_{th})^{d/2}$") && math(h).includes("$(-1)^{2s}$") && math(h).includes("$(p+1)p^{n-1}$") && renderDefectCount(h) === 0, "MATH-RESIDUE-3: a word opening with ( keeps it when its closer balances the script", math(h));
h = renderMarkdown("Euler: zeta(s) = (1 - p^{-s})^{-1}, done.");
ok(math(h).includes("$(1 - p^{-s})^{-1}$") && math(h).length === 1 && /, done\./.test(h) && renderDefectCount(h) === 0, "MATH-RESIDUE-3: a run takes back its first word's ( when that balances it", math(h));
h = renderMarkdown("The kilogram is the mass of 1 dm^3 of water; 1 cm^3 too.");
ok(math(h).includes("$1 \\,\\mathrm{dm}^{3}$") && math(h).includes("$1 \\,\\mathrm{cm}^{3}$") && /of water/.test(h), "MATH-RESIDUE-3: a unit power is typeset and the prose around it stays", math(h));
h = renderMarkdown("The wave function transforms as e^(ieλ/ħc) here.");
ok(math(h).includes("$e^{ie\\lambda /\\hbar c}$"), "MATH-RESIDUE-3: Latin h-bar inside a run converts to \\hbar", math(h));
h = renderMarkdown("Setting *c* = 1, *ħ* = 1, and *k*e = 1 here.");
ok(!math(h).some((x) => /hbar/.test(x)), "MATH-RESIDUE-3: Latin h-bar never anchors a run on its own (emphasis pairing stays intact)", math(h));

h = renderMarkdown("The gap is r_e/ℓ_P = 2.81 and Λ = ρ_c/(E_P/ℓ_P³) here.");
ok(math(h).some((x) => x.includes("r_{e}/\\ell _{P}")) && math(h).some((x) => x.includes("\\ell _{P}^{3}")), "MATH-RESIDUE-3: script-l is a subscript base and converts to \\ell", math(h));
h = renderMarkdown("Using F = *ħc*/ℓP² and more.");
ok(/<em>ħc<\/em>/.test(h) && !math(h).some((x) => /\*/.test(x)), "MATH-RESIDUE-3: emphasis opened before a word and closed inside it stays emphasis", h);

process.exit(fails ? 1 : 0);
