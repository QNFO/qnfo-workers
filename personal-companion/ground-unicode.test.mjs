// GROUND-UNICODE-1 offline suite (personal-companion 1.23.2, charter pillar: personal; agent_issues 2222).
// Proves: the deterministic name check reads names with every Unicode letter ("Otávio", "Associação", "Łódź"), reports the whole name
// (companion_runs 5766 reported "Ot", a needle that matched "not" and "other"), compares with and without accents, and keeps its ASCII
// behaviour; the grounding repair gets the whole name as its needle and deletes only the sentence that holds it.
// Run: node personal-companion/ground-unicode.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };

const ground = "Associação Ferroviária de Esportes is a Brazilian football club based in Araraquara, São Paulo. It played in the Campeonato Paulista. The club was founded in 1950. The city of Łódź is not related.";
const gp = (t, g) => V.groundingProblems(t, g === undefined ? ground : g, {});

ok(V.foldAccents("Otávio") === "Otavio" && V.foldAccents("Associação") === "Associacao", "accents fold to their base letters");
let p = gp("The club was founded in 1950. During that period Otávio Augusto was the club's leader.");
ok(p.length === 1 && p[0] === "name not in the source: Otávio Augusto", "an invented accented name is reported whole, not as 'Ot'", p);
ok(!p.some((x) => /: Ot$/.test(x)), "no fragment of the name is reported");
p = gp("The club was founded in 1950. Otávio Augusto was the club's leader.", ground + " Otávio Augusto led the club.");
ok(p.length === 0, "an accented name the source holds passes", p);
p = gp("The club was founded in 1950. Its leader was Otavio Augusto.", ground + " Otávio Augusto led the club.");
ok(p.length === 0, "a draft without the accents matches the accented source", p);
p = gp("The club was founded in 1950. Its leader was Otávio Augusto.", ground + " Otavio Augusto led the club.");
ok(p.length === 0, "an accented draft matches a source without the accents", p);
p = gp("The club is Associação Ferroviária de Esportes, from Araraquara in São Paulo.");
ok(p.length === 0, "a Portuguese club name and place from the source pass", p);
p = gp("The club once toured Łódź. It also played in Kraków.");
ok(p.length === 1 && /^name not in the source: Kraków\.?$/.test(p[0]), "a Polish name the source holds passes and one it lacks is reported whole (a sentence-final period stays, as for ASCII names)", p);
p = gp("The rebels won the Battle of Endor in 1983.", "The rebels fought.");
ok(p.some((x) => /name not in the source: Battle of Endor/.test(x)) && p.some((x) => /year not in the source: 1983/.test(x)), "ASCII names and years are checked as before", p);
p = gp("The Campeonato Paulista rewards consistency.");
ok(p.length === 0, "a capitalised source phrase passes", p);

// the repair uses the whole name
const needles = V.groundingNeedles(["grounding: name not in the source: Otávio Augusto"]);
ok(needles.length === 1 && needles[0] === "Otávio Augusto", "the repair needle is the whole name", needles);
const piece = { title: "Ferroviária", lede: "Associação Ferroviária de Esportes is a football club in Araraquara, according to the Wikipedia article on it.", body_md: "## One\n\nThe club was founded in 1950. It played in the Campeonato Paulista. It is not a large club, and other clubs are bigger.\n\n## Two\n\nDuring that period Otávio Augusto was the club's leader. The club is based in Araraquara.\n\n## Three\n\nThe club played in the Campeonato Paulista.", objection: "x" };
const v = V.groundingProblems(V.pieceText ? V.pieceText(piece) : piece.lede + "\n\n" + piece.body_md, ground, {});
ok(v.length === 1 && v[0] === "name not in the source: Otávio Augusto", "the draft has one ungrounded name", v);
const rep = V.repairGroundingDraft(piece, v.map((x) => "grounding: " + x), "notes", ground, { floorShare: 0.01 });
const out = rep && rep.piece ? rep.piece.body_md : "";
ok(rep && rep.piece && out.indexOf("Otávio") < 0, "the repair removes the sentence with the name", rep && { removed: rep.removed, problems: rep.v && rep.v.problems });
ok(out.indexOf("It is not a large club, and other clubs are bigger.") >= 0 && out.indexOf("The club is based in Araraquara.") >= 0, "sentences holding 'not', 'other' or 'ot' are kept", out);
const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 1 || (ver[0] === 1 && (ver[1] > 23 || (ver[1] === 23 && ver[2] >= 2)))), "VERSION is at least 1.23.2", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
