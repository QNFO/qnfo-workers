// REFRAME-REPAIR-1 offline suite (personal-companion 1.23.0, charter pillar: personal; agent_issues 2222).
// Proves: on a critic rejection for grounding or argument, one editor call rewrites the flagged sentences (reasoning stated as fact becomes
// explicit reasoning, invented events are deleted, nothing is added); the editor is the writer's family at the judge's temperature and never
// the critic's first family; the edit is refused when it changes the length beyond REFRAME_BAND, the headings or the analysis line; the run
// keeps the edit only when it validates and the critic reads it no worse, before the critic prune and the fact-check.
// Run: node personal-companion/reframe-repair.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };

// the prompt
const P = V.P_REFRAME;
ok(typeof P === "string" && P.length > 400, "the editor prompt exists");
ok(/rewritten in place as reasoning/.test(P) && /'A plausible reading is that'/.test(P), "reasoning stated as fact is rewritten in place as marked reasoning");
ok(/reports an event, action, statement, payment, meeting, document, rule or arrangement that the SOURCE MATERIAL does not contain is deleted/.test(P), "an invented event is deleted, not reframed");
ok(/Add nothing: no name, date, number, quotation, event, example or source/.test(P), "the editor adds nothing");
ok(/keep that line where it is; if it has none, add none/.test(P), "the analysis line stays where the writer put it");
ok(/stays word for word/.test(P), "reporting sentences are kept word for word");

// the editor's models and sampling
ok(Array.isArray(V.CF_FALLBACK.editor) && /gpt-oss/.test(V.CF_FALLBACK.editor[0]), "the editor is the writer's family first", V.CF_FALLBACK.editor);
ok(V.CF_FALLBACK.editor.every((m) => !/kimi/.test(m)), "the editor never uses the critic's first family (moonshot)");
const cw = src.slice(src.indexOf("async function callWorkersAI("), src.indexOf("async function callModel("));
ok(/temperature: role === "critic" \|\| role === "editor" \? CRITIC_TEMPERATURE : WRITER_TEMPERATURE_FB/.test(cw), "the editor samples at the judge's temperature");
ok(/role === "critic" \|\| role === "editor" \? factCheckExtra\(m\) : \{\}/.test(cw), "the editor takes the measured reasoning switch");

// parseDraftMd
const pd = V.parseDraftMd("```markdown\n# A title\n\nThe lede names Pamela Gorman.\n\n## One\n\nBody text.\n```", "fallback");
ok(pd.title === "A title" && pd.lede === "The lede names Pamela Gorman." && /## One/.test(pd.body_md) && !/```/.test(pd.body_md), "a fenced reply is read like a composed draft", pd);
ok(V.parseDraftMd("The lede.\n\n## One\n\nBody.", "Fallback title").title === "Fallback title", "a reply without a title keeps the draft's title");

// reframePiece with a stubbed Workers AI binding
const report = "Pamela Gorman served in the Arizona Senate and resigned as majority whip. She ran an advertisement in which she fired a rifle. ";
const lede = "Pamela Gorman is a former Arizona state senator, according to the Wikipedia article on her.";
const sec1 = report.repeat(5).trim();
const motive = "The advertisement was intended to signal toughness to primary voters.";
const event = "The Heartland Institute supplied talking points to her campaign.";
const reason = "The incentive for a candidate in a crowded primary is to be noticed before being agreed with.";
const body = "## The record\n\n" + sec1 + "\n\n" + "<!-- analysis -->" + "\n\n## The system\n\n" + motive + " " + event + " " + reason + " " + reason;
const piece = { title: "Pamela Gorman and the primary", subtitle: "", lede, body_md: body, objection: "Each item stands or falls on its own." };
const ground = "Pamela Gorman served in the Arizona Senate and resigned as majority whip. She ran an advertisement in which she fired a rifle. Heartland Institute. Arizona.";
const editedBody = body.replace(motive, "A plausible reading is that the advertisement was meant to signal toughness to primary voters.").replace(event + " ", "");
const mkEnv = (reply, sink) => ({ AI: { run: async (model, input) => { sink.push({ model, input }); if (reply instanceof Error) throw reply; return { response: reply }; } } });

let calls = [];
let r = await V.reframePiece(mkEnv("# " + piece.title + "\n\n" + lede + "\n\n" + editedBody, calls), piece, ground, "invented motive and an invented event", [motive, event]);
ok(r.piece && /A plausible reading is that the advertisement was meant to signal toughness/.test(r.piece.body_md), "the flagged motive comes back as reasoning", r.why);
ok(r.piece && r.piece.body_md.indexOf(event) < 0, "the invented event is gone");
ok(r.piece && r.piece.lede === lede && r.piece.title === piece.title && r.piece.objection === piece.objection, "title, lede and objection are kept");
ok(r.piece && /<!-- analysis -->/.test(r.piece.body_md), "the analysis line is kept");
ok(/ -> /.test(r.why) && /2 flagged/.test(r.why), "the note gives the lengths and the flagged count", r.why);
ok(calls.length === 1 && /gpt-oss/.test(calls[0].model), "one editor call, writer family first", calls.map((c) => c.model));
ok(calls[0].input.temperature === V.CRITIC_TEMPERATURE && calls[0].input.reasoning && calls[0].input.reasoning.effort === "low", "the call samples at the judge's temperature with low reasoning", calls[0].input.temperature);
const um = calls[0].input.messages[1].content;
ok(/^SOURCE MATERIAL:/.test(um) && um.indexOf(ground.slice(0, 60)) > 0, "the editor reads the source material");
ok(um.indexOf("- " + motive.replace(/\.$/, "")) >= 0 && um.indexOf("- " + event.replace(/\.$/, "")) >= 0, "the critic's quotations are listed as FLAGGED", um.slice(um.indexOf("FLAGGED"), um.indexOf("FLAGGED") + 300));
ok(/READER'S OBJECTION: invented motive and an invented event/.test(um) && /DRAFT:\n# Pamela Gorman and the primary/.test(um), "the editor reads the objection and the whole draft");
ok(calls[0].input.messages[0].content === V.P_REFRAME, "the system prompt is P_REFRAME");

calls = [];
r = await V.reframePiece(mkEnv("# " + piece.title + "\n\n" + lede + "\n\n## The record\n\nShort.\n\n<!-- analysis -->\n\n## The system\n\n" + reason + " Padding to pass the eighty character minimum of a reply.", calls), piece, ground, "x", [motive]);
ok(!r.piece && /^edit length \d+ of \d+ words$/.test(r.why), "an edit that cuts the draft beyond the band is refused", r.why);
r = await V.reframePiece(mkEnv("# " + piece.title + "\n\n" + lede + "\n\n" + editedBody + " " + sec1 + " " + sec1, []), piece, ground, "x", [motive]);
ok(!r.piece && /^edit length/.test(r.why), "an edit that grows the draft beyond the band is refused", r.why);
r = await V.reframePiece(mkEnv("# " + piece.title + "\n\n" + lede + "\n\n" + editedBody.replace("<!-- analysis -->\n\n", ""), []), piece, ground, "x", [motive]);
ok(!r.piece && r.why === "edit dropped the analysis line", "an edit that drops the analysis line is refused", r.why);
r = await V.reframePiece(mkEnv("# " + piece.title + "\n\n" + lede + "\n\n" + editedBody.replace("## The system\n\n", ""), []), piece, ground, "x", [motive]);
ok(!r.piece && /^edit changed the headings/.test(r.why), "an edit that changes the headings is refused", r.why);
const unmarked = Object.assign({}, piece, { body_md: body.replace("<!-- analysis -->\n\n", "") });
r = await V.reframePiece(mkEnv("# " + piece.title + "\n\n" + lede + "\n\n" + editedBody, []), unmarked, ground, "x", [motive]);
ok(!r.piece && r.why === "edit added an analysis line", "an edit that adds an analysis line the writer did not place is refused", r.why);
r = await V.reframePiece(mkEnv(new Error("upstream 503"), []), piece, ground, "x", [motive]);
ok(!r.piece && /^editor unavailable/.test(r.why) && /503/.test(r.why), "an unavailable editor leaves the draft as it was", r.why);

// the run: where the edit sits and when it is kept
const gen = src.slice(src.indexOf("var floorForForm = form === \"notes\" ? ACCEPT_FLOOR_NOTES : ACCEPT_FLOOR_ESSAY;"), src.indexOf("// the fact-check: two reviewers from other model families"));
const iR = gen.indexOf("var rf = await reframePiece(env, piece, ground, q.why, q.invented);"), iP = gen.indexOf("for (var cround = 1; cround <= CRITIC_PRUNE_ROUNDS");
ok(iR > 0 && iP > iR, "the edit runs before the critic prune");
ok(/if \(worst < floorForForm && \(worstName === "grounding" \|\| worstName === "argument"\) && Date\.now\(\) - t0 < REFRAME_START_BEFORE_MS\)/.test(gen), "only a grounding or argument rejection with time left starts the edit");
ok(/var rfv = rf\.piece \? validatePiece\(rf\.piece, form, ground, repairOpts\) : null;/.test(gen), "the edit is validated like any repaired draft (names, years, figures, floors, lede)");
ok(/var critR = await critiquePiece\(env, rf\.piece, form, ground\);/.test(gen), "the critic reads the edited draft");
ok(/if \(scR && !scR\.missing && scR\.worst >= worst\) \{ piece = rf\.piece; v = rfv; q = critR;/.test(gen), "the edit is kept only when the critic reads it no worse");
ok(/"reframe: " \+ rf\.why/.test(gen) && /"reframe kept the draft: "/.test(gen), "both outcomes are logged");
ok(V.REFRAME_START_BEFORE_MS < 6e5 && V.REFRAME_BAND[0] === 0.85 && V.REFRAME_BAND[1] === 1.15, "the edit starts inside the run budget and the band is 85-115%");
const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 1 || (ver[0] === 1 && ver[1] >= 23)), "VERSION is at least 1.23.0", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
