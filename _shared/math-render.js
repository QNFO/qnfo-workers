/**
 * MATH-RENDER-1 — canonical math rendering module for the QNFO fleet.
 *
 * Copy this block verbatim into any Worker whose HTML surface may carry LaTeX.
 * The escaping trap below has already shipped twice in this fleet; both times
 * the page showed raw backslash-parens to the reader while the source looked
 * right. Run scripts/math-render-guard.mjs — do not eyeball it.
 *
 * CONTRACT
 *   PRECONDITION : the surface emits HTML that may contain LaTeX delimiters
 *                  \(   \)   \[   \]   $   $   $$   $$
 *   POSTCONDITION: MathJax v3 loads (first reachable CDN wins) and every
 *                  delimited expression is typeset into an <mjx-container>.
 *   INVARIANT    : window.MathJax.config.tex.inlineMath is [['$','$'],['\\(','\\)']]
 *                  window.MathJax.config.tex.displayMath is [['$$','$$'],['\\[','\\]']]
 *                  i.e. each delimiter is exactly ONE backslash character
 *                  followed by its bracket.
 *
 * WHY THE BACKSLASH IS BUILT AT RUNTIME — two escape layers, not one:
 *   1. the Worker builds an HTML string containing a <script> whose JS source
 *      declares the delimiters, and the browser then parses that JS source;
 *   2. inside a JS string literal an unrecognised escape such as a lone
 *      backslash-paren silently reduces to a bare paren.
 *   So the SERVED source needs TWO backslashes for MathJax to receive ONE.
 *   Emitting a single backslash, or the six-character token u005C, yields a
 *   config that parses to a bare paren while looking correct in the editor.
 */

var BS = String.fromCharCode(92); // exactly one backslash, unambiguous at every layer

function mathHead() {
  return "<script>window.MathJax={tex:{inlineMath:[['$','$'],['" + BS + BS + "(','" + BS + BS + ")']]," +
    "displayMath:[['$$','$$'],['" + BS + BS + "[','" + BS + BS + "]']],processEscapes:true}," +
    "options:{skipHtmlTags:['script','noscript','style','textarea','pre','code'],enableMenu:false}};</scr" + "ipt>" +
    "<script>(function(){var u=['https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js'," +
    "'https://unpkg.com/mathjax@3/es5/tex-svg.js'," +
    "'https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.min.js'];var i=0;" +
    "function n(){if(i>=u.length)return;var s=document.createElement('script');s.src=u[i++];s.async=true;s.onerror=n;document.head.appendChild(s);}n();})();</scr" + "ipt>";
}

// Only pay for the third-party script when the document actually contains math.
function hasMath(text) { return /\\\(|\\\[|\$/.test(String(text || "")); }
function mathHeadFor(text) { return hasMath(text) ? mathHead() : ""; }

// Markdown -> HTML must not let emphasis regexes eat characters inside math.
// Slot the math regions out, run emphasis, slot them back.
function protectMath(escaped, slots) {
  return String(escaped).replace(/\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$\$[\s\S]+?\$\$/g, function(m) {
    slots.push(m);
    return "\u0000M" + (slots.length - 1) + "\u0000";
  });
}
function restoreMath(escaped, slots) {
  return String(escaped).replace(/\u0000M(\d+)\u0000/g, function(_, i) { return slots[+i]; });
}

module.exports = { BS: BS, mathHead: mathHead, mathHeadFor: mathHeadFor, hasMath: hasMath, protectMath: protectMath, restoreMath: restoreMath };
