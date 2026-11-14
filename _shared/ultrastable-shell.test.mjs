// ULTRASTABLE-SHELL-1 / RUNS-ON-ULTRASTABLE-1 offline suite: "QNFO runs on Ultrastable" is true in code.
// Proves: the vendored Ultrastable runtime shell (_shared/ultrastable-shell.css, .js, .json) hashes to the contract's content_hash and to the
// source record (_shared/ultrastable-shell.source.json: repo, path, commit); the module is inlinable; every adopting worker holds exactly the
// vendored block in worker.js and its mirror and names the same source commit; the dashboard feeds the shell's seven-key vocabulary from its
// own reads (runsOnValues); and fleet.qnfo.org's "/", "/focus" and "/touch" render offline with the shell's top bar, status panel and mark and
// still pass dsLint. A refresh from Ultrastable that is not re-vendored and re-inlined fails here.
// Run: node _shared/ultrastable-shell.test.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { current, block, moduleSource } from "./inline-ultrastable-shell.mjs";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8").replace(/\r\n/g, "\n");
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

// ---- parity with the Ultrastable contract
const css = read("_shared/ultrastable-shell.css"), js = read("_shared/ultrastable-shell.js");
const contract = JSON.parse(read("_shared/ultrastable-shell.json")), source = JSON.parse(read("_shared/ultrastable-shell.source.json"));
ok(sha(css) === contract.css_sha256, "vendored css hashes to the contract's css_sha256", sha(css));
ok(sha(js) === contract.js_sha256, "vendored js hashes to the contract's js_sha256", sha(js));
ok(sha(css + "\n" + js) === contract.content_hash, "vendored css + js hash to the contract's content_hash");
ok(source.content_hash === contract.content_hash, "the source record names the same content_hash as the contract", [source.content_hash, contract.content_hash]);
ok(source.version === contract.version && source.id === contract.id, "the source record names the same id and version");
ok(/^[0-9a-f]{40}$/.test(source.commit) && source.repo === "ultrastable/ultrastable" && source.path === "brand/shell/artifact", "the source record names repo, path and a full commit");

// ---- the module is inlinable and matches its CSS
ok(!/^\s*(import|export)\b/m.test(js) && !js.includes("/*"), "the module has no import, export or block comment, so it can be inlined");
const names = [...moduleSource().matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
ok(names.length > 8 && names.every((n) => /^(US_|us)/.test(n)), "every top-level name is US_/us prefixed", names);
const US = new Function(moduleSource() + "\nreturn {" + names.join(",") + "};")();
ok(US.US_SHELL_CSS + "\n" === css, "US_SHELL_CSS equals the vendored css");
ok(US.US_SHELL_VERSION === contract.version, "the module's version is the contract's");
const KEYS = contract.vocabulary.map((v) => v.key);
ok(KEYS.length === 7 && KEYS.includes("k_eff") && KEYS.includes("open_ignition_gaps"), "the vocabulary has the seven shared keys", KEYS);

// ---- adopters hold the vendored block and the same source record
for (const dir of source.adopters) {
  for (const f of ["worker.js", "deployed-current.worker.js"]) {
    const text = read(dir + "/" + f);
    ok(current(text) === block(), dir + "/" + f + " holds the vendored ULTRASTABLE-SHELL-1 block (run node _shared/inline-ultrastable-shell.mjs " + dir + ")");
    ok(text.includes('commit: "' + source.commit + '"') && text.includes('content_hash: "' + source.content_hash + '"'), dir + "/" + f + " RUNS_ON_SHELL_SOURCE names the vendored commit and hash");
  }
}

// ---- the dashboard maps its own reads onto the vocabulary
const dash = read("qnfo-fleet-dashboard/worker.js");
const a = dash.indexOf("var RUNS_ON_SOURCES"), b = dash.indexOf("async function runsOnState");
ok(a > 0 && b > a, "runsOnValues is present");
const map = new Function(dash.slice(a, b) + "\nreturn { runsOnValues, RUNS_ON_SOURCES };")();
ok(KEYS.every((k) => map.RUNS_ON_SOURCES[k] || k === "loops_total"), "every vocabulary key names its source record", Object.keys(map.RUNS_ON_SOURCES));
const live = map.runsOnValues({ generated_at: "2026-11-14T15:00:00.000Z",
  work: { ok: true, deploys_ok_24h: 51, watchmaker_index: 5, issues_opened_24h: 40, issues_closed_24h: 44 },
  health: { ok: true, workers_reporting: 70, workers_total: 74 }, spend: { ok: true, pace_vs_budget: 1.2 }, needs: { ok: true, count: 2 } });
ok(live.values.k_eff === Math.round(51 / (1.2 + 2) * 1000) / 1000, "k_eff = successful deploys / (cost pace + identity-bound owner cards)", live.values);
ok(live.values.open_ignition_gaps === 5 && live.values.loops_running === 70 && live.values.loops_total === 74 && live.values.loops_stalled === 4, "gaps from watchmaker_index, loops from heartbeats", live.values);
ok(live.values.items_in_24h === 40 && live.values.items_out_24h === 44 && live.values.cost_vs_budget === 1.2, "items and cost pass through", live.values);
ok(live.as_of === "2026-11-14 15:00 UTC", "as of is the screen's generation time", live.as_of);
ok(US.usStatusSentence(live.values) === "Not yet self-sustaining: criticality 15.94, 5 open ignition gaps, 70 of 74 loops running, 40 items in and 44 out in 24 h, cost at 1.2× budget.", "the sentence reads the mapped values", US.usStatusSentence(live.values));
const cheap = map.runsOnValues({ work: { ok: true, deploys_ok_24h: 3 }, spend: { ok: true, pace_vs_budget: 0.02 }, needs: { ok: true, count: 0 } });
ok(cheap.values.k_eff === 30, "the cost floor (0.1) keeps k finite when spend is near zero", cheap.values.k_eff);
const failed = map.runsOnValues({ work: { ok: false }, health: { ok: false }, spend: { ok: false }, needs: { ok: false } });
ok(KEYS.every((k) => failed.values[k] === null), "a section that failed shows n/a, never a zero", failed.values);

// ---- fleet.qnfo.org pages render the shell offline and still pass dsLint
const dsSrc = read("_shared/design-system.js");
const dsNames = [...dsSrc.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
const DS = new Function(dsSrc + "\nreturn {" + dsNames.join(",") + "};")();
function d1Stub() { const st = { bind() { return st; }, async all() { return { results: [] }; }, async first() { return null; }, async run() { return { success: true }; } }; return { prepare() { return st; }, async batch() { return []; } }; }
const mod = (await import(pathToFileURL(fileURLToPath(new URL("qnfo-fleet-dashboard/worker.js", root))).href)).default;
const ctx = { waitUntil() {}, passThroughOnException() {} };
for (const [path, env] of [["/", () => ({})], ["/focus", () => ({ AUDIT: d1Stub() })], ["/touch", () => ({ AUDIT: d1Stub() })]]) {
  let html = "";
  try { html = await (await mod.fetch(new Request("https://fleet.qnfo.org" + path), env(), ctx)).text(); }
  catch (e) { ok(false, path + " renders offline", e.message); continue; }
  ok(html.includes('<header class="us-top" data-us-shell="' + contract.version + '"'), path + " has the shell's top bar");
  ok(html.includes("QNFO fleet"), path + " names the instance in the top bar");
  ok(html.includes('data-runs-on="ultrastable"') && html.includes(contract.mark.href), path + " carries the Runs on Ultrastable mark");
  ok(html.includes(".us-top{"), path + " carries the shell CSS");
  ok(DS.dsLint(html).length === 0, path + " still passes dsLint", DS.dsLint(html));
  if (path === "/") {
    ok(html.includes('<section class="us-status"'), "/ has the shell's status panel");
    ok(KEYS.every((k) => html.includes('data-key="' + k + '"')), "/ shows a tile for each of the seven keys");
    ok(html.indexOf('class="us-top"') < html.indexOf('class="us-status"') && html.indexOf('class="us-status"') < html.indexOf('id="s-now"') && html.indexOf('id="s-now"') < html.indexOf('class="us-foot"'), "/ follows the skeleton order: top, status, screens, foot");
    ok(html.includes('id="pill"'), "/ keeps the live pill inside the top bar");
  }
}
const api = await (await mod.fetch(new Request("https://fleet.qnfo.org/api/runs-on"), {}, ctx)).json();
ok(api.schema_version === "runs-on/1" && api.shell.source.content_hash === contract.content_hash && api.shell.version === contract.version, "/api/runs-on names the shell and its source", api.shell);
ok(KEYS.every((k) => k in api.values && k in api.verdicts) && typeof api.sentence === "string", "/api/runs-on carries every key, its verdict and the sentence");
ok(/usMark\(\) \+ FLEET_THEME_BTN/.test(dash) && /RUNS_ON_TOKENS_CSS \+ US_SHELL_CSS/.test(dash), "the classic pages carry the mark and the shell CSS through fleetTop and fleetHead");

console.log("ultrastable-shell: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
