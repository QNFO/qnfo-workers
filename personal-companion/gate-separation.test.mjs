// GATE-SEPARATION-1 offline suite (personal-companion 1.27.0, charter pillar: personal; agent_issues 2552).
// Proves: one judge per property. qualityWorst gates on specificity, argument, objection (essays), voice and systems, never grounding;
// gateWorst uses the old critiqueWorst only when ops_config companion_critic_grounding_gate is on; every critic gate in generate goes
// through gateWorst; an advisory critic grounding deletes the quoted sentences once before the two-family fact-check, which still gates.
// Run: node personal-companion/gate-separation.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { importWorker } from "./_harness-import-worker.mjs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await importWorker(() => (src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()), new URL("./", import.meta.url));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

const goodButUngrounded = { specificity: 8, argument: 7, objection: 7, voice: 8, systems: 7, grounding: 0 };
const q = V.qualityWorst(goodButUngrounded, "essay");
ok(q.worst === 7 && q.worstName !== "grounding" && !q.missing, "a draft that passes every quality dimension passes the quality gate whatever its grounding score", q);
ok(V.gateWorst(goodButUngrounded, "essay", false).worst === 7, "with the switch off the critic's grounding does not gate");
const old = V.gateWorst(goodButUngrounded, "essay", true);
ok(old.worst === 0 && old.worstName === "grounding", "with ops_config companion_critic_grounding_gate on, the old gate returns", old);
ok(V.qualityWorst({ specificity: 8, argument: 3, objection: 7, voice: 8, systems: 7, grounding: 9 }, "essay").worstName === "argument", "a weak quality dimension still gates");
ok(V.qualityWorst({ specificity: 8, argument: 8, voice: 8, systems: 8 }, "notes").worst === 8, "notes have no objection dimension");
ok(V.qualityWorst({ specificity: 8 }, "essay").missing === true, "a missing score fails closed");

const env = (v) => ({ AUDIT: { prepare: () => ({ first: async () => (v === undefined ? null : { value: v }) }) } });
ok((await V.criticGroundingGates(env("on"))) === true && (await V.criticGroundingGates(env(undefined))) === false && (await V.criticGroundingGates(env("off"))) === false, "the switch is off unless set on");
ok((await V.criticGroundingGates({ AUDIT: { prepare: () => { throw new Error("d1 down"); } } })) === false, "an unreadable switch keeps the new gate (logged)");

const gen = src.slice(src.indexOf("async function generate(env, form, opts) {"), src.indexOf("__name(generate"));
ok(/var gg = await criticGroundingGates\(env\);/.test(gen), "generate reads the switch once");
ok(!/critiqueWorst\(/.test(gen) && (gen.match(/gateWorst\(/g) || []).length === 6, "every critic gate in generate goes through gateWorst", (gen.match(/gateWorst\(/g) || []).length);
const iAdv = gen.indexOf("GATE-SEPARATION-1: the critic's grounding is advisory"), iFc = gen.indexOf('await logRun(env, form, model, topic.id, "stage", "fact-check", Date.now() - t0);');
ok(iAdv > 0 && iFc > iAdv, "the advisory prune runs before the fact-check", [iAdv, iFc]);
ok(/if \(!gg && Number\.isFinite\(Number\(q\.grounding\)\) && Number\(q\.grounding\) < ACCEPT_FLOOR_NOTES\) \{/.test(gen) && /if \(gpv && gpv\.ok\) \{ piece = gpr\.piece; v = gpv; \}/.test(gen), "the quoted sentences are deleted only when the draft still validates");
ok(/var vr = await verifyPiece\(env, pieceText\(piece\), ground, model, topic\.id \+ ":" \+ attempt, \{\}\);/.test(gen) && /if \(!vr\.ok\) \{\s*await logRun\(env, form, model, topic\.id, "rejected", "fact-check "/.test(gen), "the two-family fact-check still reads the draft and still rejects on a FACT error");

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 1 || (ver[0] === 1 && ver[1] >= 27)), "VERSION is at least 1.27.0", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
