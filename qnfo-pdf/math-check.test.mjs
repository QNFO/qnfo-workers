// MATH-BROWSER-1 (1.1.0): mathReport grades a MathJax-typeset page. The function is read out of worker.js so the test needs
// no bundle dependencies.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "worker.js"), "utf8");
const body = /function mathReport\(html\) \{[\s\S]*?\n\}/.exec(src)[0];
const mathReport = new Function(body + "\nreturn mathReport;")();

test("a typeset page with currency and identifiers passes", () => {
  const r = mathReport('<p>Cost <span class="usd">$</span>5 and <span class="usd">$</span>6.</p><p>noise_sigma and curve_fit</p><mjx-container>x</mjx-container><mjx-container>y</mjx-container>');
  assert.equal(r.typeset, 2);
  assert.equal(r.raw_dollar, 0);
  assert.equal(r.pseudo_residual, 0);
  assert.equal(r.pass, true);
});

test("untypeset $...$, MathJax errors and residual pseudo-math fail", () => {
  const r = mathReport('<p>$x_1$ left raw; a_1 b_2 c_3</p><mjx-container data-mjx-error="x"><mjx-merror>bad</mjx-merror></mjx-container>');
  assert.equal(r.raw_dollar, 1);
  assert.ok(r.errors >= 1);
  assert.ok(r.pseudo_residual >= 3);
  assert.equal(r.pass, false);
});
