import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { checkPortfolio } from "./qnfo_portfolio.mjs";
const j = (f) => JSON.parse(readFileSync(new URL("../" + f, import.meta.url), "utf8"));
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
test("every live worker is core or in exactly one QNFO product", () => {
  const r = checkPortfolio(root, j("qnfo/portfolio.json"), j("product/boundary.json"));
  assert.deepStrictEqual(r.violations, []);
});
test("a duplicate worker is caught", () => {
  const p = j("qnfo/portfolio.json"); p.products.qwav.workers = ["idea-hub"];
  assert.ok(checkPortfolio(root, p, j("product/boundary.json")).violations.some((x) => /two products/.test(x)));
});
