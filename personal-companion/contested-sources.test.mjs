// EK-2 offline suite: contested topics require three independent full texts, multiple labelled viewpoints, and a verified non-US source.
// Run: node personal-companion/contested-sources.test.mjs
import { readFileSync } from "node:fs";
import { importWorker } from "./_harness-import-worker.mjs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await importWorker(() => src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random(), new URL("./", import.meta.url));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (condition, message, value) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + message + (value === undefined ? "" : " -- " + JSON.stringify(value).slice(0, 400)));
  }
};
const anchor = (host, viewpoint, sourceCountry, textLength = 3200) => ({
  kind: "source",
  ref: "https://" + host + "/article",
  title: "Evidence on the subject",
  text: "Evidence. ".repeat(Math.ceil(textLength / 10)).slice(0, textLength),
  viewpoint,
  sourceCountry
});
const qualifying = [
  anchor("www.example.org", "government position", "AF"),
  anchor("example.net", "regional community", "PK"),
  anchor("example.com", "civil society", "US")
];

ok(V.contestedSourcesOk(qualifying).ok, "three full texts from distinct publishers, two explicit viewpoints, and a non-US source qualify");
ok(!V.contestedSourcesOk([qualifying[0], qualifying[0], qualifying[1]]).ok, "duplicate source references do not count twice");
ok(!V.contestedSourcesOk([
  qualifying[0], { ...qualifying[1], viewpoint: "government position" }, anchor("third.example", "government position", "US")
]).ok, "multiple outlets with one viewpoint do not qualify");
ok(!V.contestedSourcesOk(qualifying.map((a) => ({ ...a, sourceCountry: "US" })).slice(0, 3)).ok, "US-only sources do not qualify");
ok(!V.contestedSourcesOk(qualifying.map((a) => ({ ...a, sourceCountry: "" }))).ok, "missing country evidence does not qualify");
ok(!V.contestedSourcesOk(qualifying.map((a) => ({ ...a, sourceCountry: "ZZ" }))).ok, "an unknown region code is not accepted as country evidence");
ok(!V.contestedSourcesOk(qualifying.map((a) => ({ ...a, viewpoint: "neutral" }))).ok, "generic or neutral labels do not establish differing viewpoints");
ok(!V.contestedSourcesOk(qualifying.map((a) => ({ ...a, text: "short" }))).ok, "short excerpts do not count as full-text sources");
ok(!V.contestedSourcesOk([
  qualifying[0],
  qualifying[1],
  anchor("m.example.org", "another viewpoint", "AF")
]).ok, "mobile and www aliases of one publisher do not count as independent sources");

const byTitleOnly = qualifying.map((a) => ({ ...a, title: "Afghanistan war policy", text: "Ordinary descriptive text.".repeat(150), viewpoint: "", sourceCountry: "" }));
ok(["policy", "history", "geopolitics", "health", "economics"].every(V.isContestedTopic), "the contested-topic classifier recognizes each required category");
ok(V.fitAnchors(byTitleOnly).length === 0, "a contested title with no viewpoint or country evidence is dropped before drafting");
const fitted = V.fitAnchors(qualifying);
ok(fitted.length === 3 && fitted[0].viewpoint === qualifying[0].viewpoint && fitted[0].sourceCountry === "AF", "source metadata survives the grounding-budget fit");
ok(V.fitAnchors([{ ...qualifying[0], title: "A quiet garden", text: "A non-contested subject." }]).length === 1, "non-contested topics retain the existing source path");
ok(/source metadata \(not factual evidence\): viewpoint=government position; sourceCountry=AF/.test(V.anchorsBlock({ a: "Afghanistan war policy" }, fitted, "", "")), "the writer sees source annotations but is told they are not factual evidence");
ok(/at least three independent full-text sources/.test(V.prompts.P_STYLE) && /at least two explicit viewpoint labels/.test(V.prompts.P_STYLE), "the writer prompt requires comparison of multiple viewpoints");

console.log("contested-sources: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
