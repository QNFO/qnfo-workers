// GROUND-DESCRIPTOR-1 + TOPIC-COOLDOWN-2 + REJECT-CONTEXT-2 offline suite (personal-companion 1.16.1, issues 2222 and 2354, charter pillar: personal).
// reading.q08.org published nothing for 61 h: runs 5128-5134 rejected five drafts of one topic for "name not in the source: American;
// Midwestern; U.S.; St.; Archival" (5131 for the first two alone), the cooldown counted only 'failed' rows so the same article was
// retried 29 times in a day, and the rejection log's "in context" field was always empty. Proves: a capitalised descriptor word, a
// dotted initialism and a title abbreviation are not name problems; a stem the source contains grounds its derived word; an invented
// name, an invented multi-word organisation with a descriptor word, and an invented figure or year still fail; the cooldown query
// counts rejected attempts; problemContext finds the needle of a two-label message.
// Run: node personal-companion/ground-descriptor.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };

const vm = /^(\d+)\.(\d+)\.(\d+)/.exec(src.match(/var VERSION = "([^"]+)"/)[1]);
ok(vm && (+vm[1] > 1 || (+vm[1] === 1 && (+vm[2] > 16 || (+vm[2] === 16 && +vm[3] >= 1)))), "VERSION at least 1.16.1");

const source = "Theodore Wirth was a Swiss-born horticulturalist who became superintendent of parks in Minneapolis in 1906. He had worked in Zurich, London and Paris and in Hartford, Connecticut. The park board kept an archive of his plans and the city's Midwest climate shaped them.";
const g = (txt) => V.groundingProblems(txt, source, { today: "2026-10-12" });

// ---- descriptor words, initialisms and abbreviations are not names --------------------------------------------------------------
ok(g("Wirth's ideas reshaped American park administration across the Midwestern states.").length === 0, "American and Midwestern alone are not name problems", g("Wirth's ideas reshaped American park administration across the Midwestern states."));
ok(g("The plans reached the U.S. parks movement and the Victorian ideal of the pleasure ground.").length === 0, "a dotted initialism and a Victorian-style descriptor pass", g("The plans reached the U.S. parks movement and the Victorian ideal of the pleasure ground."));
ok(g("The office on St. Anthony road kept the Archival plans.").filter((x) => /St\.|Archival/.test(x)).length === 0, "St. is an abbreviation and Archival is grounded by archive", g("The office on St. Anthony road kept the Archival plans."));
ok(g("He read the Parisian press in Zurich.").length === 0, "Parisian is grounded by its stem Paris", g("He read the Parisian press in Zurich."));

// ---- what still fails ------------------------------------------------------------------------------------------------------------
ok(g("Wirth met Frederick Law Olmsted in Chicago.").some((x) => /Olmsted/.test(x)) && g("Wirth met Frederick Law Olmsted in Chicago.").some((x) => /Chicago/.test(x)), "an invented person and an invented city still fail");
ok(g("He joined the American Planning Association that year.").some((x) => /American Planning Association/.test(x)), "a multi-word organisation with a descriptor word still fails when the source lacks it", g("He joined the American Planning Association that year."));
ok(g("The board counted 810 acres in 1920.").length === 2, "an invented figure and an invented year still fail", g("The board counted 810 acres in 1920."));
ok(g("Later, Zorblax reviewed the plans.").some((x) => /Zorblax/.test(x)), "an invented single-word name that is not descriptor-shaped still fails");

// ---- the stem rule ---------------------------------------------------------------------------------------------------------------
const words = new Set(["archive", "america", "midwest", "paris", "record"]);
ok(V.stemGrounded("archival", words) && V.stemGrounded("american", words) && V.stemGrounded("midwestern", words) && V.stemGrounded("parisian", words) && V.stemGrounded("records", words), "stems: archival, american, midwestern, parisian, records");
ok(!V.stemGrounded("olmsted", words) && !V.stemGrounded("chicago", words) && !V.stemGrounded("zorblax", words), "stems: unrelated words are not grounded");

// ---- the cooldown counts rejected attempts ---------------------------------------------------------------------------------------
ok(/status IN \('failed','rejected'\) THEN 1 ELSE 0 END\) f FROM companion_runs/.test(src), "the topic cooldown counts rejected rows (TOPIC-COOLDOWN-2)");
ok(/Number\(crr\[ci\]\.f\) >= 2\) cooled\[crr\[ci\]\.topic\] = true/.test(src), "two rejected attempts cool a topic");

// ---- the rejection context finds its needle --------------------------------------------------------------------------------------
const ctx = V.problemContext("Title\n\nThe plans reshaped American parks for decades.", ["grounding: name not in the source: American"]);
ok(/American => …/.test(ctx) && /reshaped American parks/.test(ctx), "problemContext strips both labels and shows the surrounding text", ctx);
ok(V.problemContext("x", ["essay length 10"]) === "", "a message with no needle in the text gives no context");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
