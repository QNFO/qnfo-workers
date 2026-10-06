// MECHANISM-FIRST-1 offline suite (qnfo-ipatent 3.11.0, agent_issues 2053). The real fetch handler with a stubbed model:
// POST /api/mechanism returns a card and its holes; a description with an effect but no mechanism yields a NOT STATED hole,
// never an invented mechanism; bots and short descriptions are refused; POST /api/draft with a card puts the card and the
// claim-derivation rules into the drafting prompt, without a card the prompt carries no card; every draft prompt carries
// the means-not-law, structure-for-function and enabled-range rules.
// Run: node qnfo-ipatent/mechanism.test.mjs   (prints "N passed, 0 failed")
const mod = await import("./worker.js");
const W = mod.default;
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const stmt = () => { const s = { bind() { return s; }, async run() { return {}; }, async first() { return null; }, async all() { return { results: [] }; } }; return s; };
const seen = [];
let reply = "";
const env = {
  IPATENT_DB: { prepare: stmt },
  AI: { run: async (model, opts) => {
    if (!opts || !opts.messages) return { data: [[0.1, 0.2]] }; // embeddings
    seen.push(opts.messages.map((m) => m.content).join("\n"));
    return { response: typeof reply === "function" ? reply(opts) : reply };
  } }
};
const ctx = { waitUntil() {} };
const UA = "Mozilla/5.0 (Macintosh) Safari/605";
const post = async (path, body, ua = UA) => {
  const r = await W.fetch(new Request("https://ipatent.qnfo.org" + path, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": ua }, body: JSON.stringify(body) }), env, ctx);
  return { status: r.status, j: await r.json() };
};
const desc = "A drawer hinge with a torsion spring around a stainless pivot pin so the front folds flat against the cabinet side and closes itself.";

// 1. A full card from the model.
reply = JSON.stringify({
  what_it_is: "A mounting plate, a pivot pin through a sleeve on the plate, and a torsion spring wound on the pin.",
  what_it_does: "Lets the drawer front fold flat past 90 degrees and returns it closed with about 0.3 N m of torque.",
  how_it_works: "The spring is pre-loaded at assembly so its stored torsional energy rises as the front opens and drives it back toward closed.",
  distinction: "The pivot axis sits inside the cabinet side, so the folded front lies coplanar with it.",
  nearest_known: "Exterior-mounted hinges, which protrude and limit the opening angle.",
  window_holds: "Pin diameters of 4 to 8 mm and preload torques of 0.1 to 0.5 N m.",
  window_breaks: "Above about 0.5 N m the front slams; below 0.1 N m it does not close."
});
let r = await post("/api/mechanism", { title: "Folding drawer hinge", description: desc });
ok(r.status === 200 && r.j.mechanism && r.j.mechanism.distinction.includes("coplanar"), "POST /api/mechanism returns the card", r);
ok(Array.isArray(r.j.holes) && r.j.holes.length === 0, "a complete, measurable card has no holes", r.j.holes);
ok(r.j.fields.length === 7 && r.j.fields.every((f) => f.key && f.label && f.asks), "the response lists the seven fields with their questions");
ok(/NOT STATED/.test(seen[seen.length - 1]) && /never invent/i.test(seen[seen.length - 1]), "the extraction prompt forbids invention and names the NOT STATED marker");

// 2. Effect but no mechanism: holes, nothing invented.
reply = "```json\n" + JSON.stringify({ what_it_is: "A hinge.", what_it_does: "It works better.", how_it_works: "NOT STATED", distinction: "n/a", nearest_known: "", window_holds: "unknown", window_breaks: "Not stated." }) + "\n```";
r = await post("/api/mechanism", { title: "Better hinge", description: "A hinge that works better than other hinges for drawers in kitchens and offices everywhere." });
const hf = (r.j.holes || []).map((h) => h.field);
ok(r.status === 200 && r.j.mechanism.how_it_works === "NOT STATED", "a missing mechanism stays NOT STATED (no invented mechanism)", r.j.mechanism);
ok(["how_it_works", "distinction", "nearest_known", "window_holds", "window_breaks"].every((k) => hf.includes(k)), "each missing field is a hole", hf);
ok(hf.filter((k) => k === "what_it_does").length === 1, "an effect with no number, unit or comparison is a hole", r.j.holes);

// 2b. A distinction with no nearest known approach cannot be checked: a hole on the distinction.
reply = JSON.stringify({ what_it_is: "A ceramic tile filled with paraffin under a battery pack.", what_it_does: "Keeps cells below 40 C at the afternoon peak.", how_it_works: "Latent heat absorbed as the paraffin melts at 38 C removes heat from the cells during the peak.", distinction: "The paraffin phase-change material.", nearest_known: "NOT STATED", window_holds: "10 to 30 mm of paraffin.", window_breaks: "Under 10 mm it saturates." });
r = await post("/api/mechanism", { title: "Cooling tile", description: desc });
ok(r.j.holes.some((h) => h.field === "distinction" && /nearest known/.test(h.why)) && r.j.holes.some((h) => h.field === "nearest_known"), "a distinction with no nearest known approach is a hole", r.j.holes);

// 3. Refusals.
ok((await post("/api/mechanism", { title: "x", description: "too short" })).status === 400, "a short description is refused (400)");
ok((await post("/api/mechanism", { title: "Folding drawer hinge", description: desc }, "python-requests/2.31")).status === 403, "an automated client is refused (403)");
ok((await post("/api/mechanism", { title: "Folding drawer hinge", description: desc }, "")).status === 403, "an empty user agent is refused (403)");
reply = "I cannot help with that.";
r = await post("/api/mechanism", { title: "Folding drawer hinge", description: desc });
ok(r.status === 503 && r.j.attempts.length >= 1 && r.j.attempts.every((a) => a.outcome !== "ok"), "no parseable card from any model is a 503 with attempts", r);
const g = await W.fetch(new Request("https://ipatent.qnfo.org/api/mechanism", { headers: { "User-Agent": UA } }), env, ctx);
ok(g.status === 404 || g.status === 405, "GET /api/mechanism is not served", g.status);

// 4. Drafting with and without a card.
const DRAFT = "## 1. TITLE OF INVENTION\nFolding drawer hinge\n## 2. TECHNICAL FIELD\nFurniture.\n## 3. BACKGROUND\nB.\n## 4. SUMMARY OF THE INVENTION\nS.\n## 5. DETAILED DESCRIPTION\nD.\n## 6. CLAIMS\n1. A hinge comprising a pin.\n## 7. ABSTRACT\nA.\n## 8. INVENTOR DECLARATION\nI.\n## 9. SUPPORT GAPS\n- none";
reply = DRAFT;
const card = { what_it_is: "A plate, a pin and a spring.", what_it_does: "Folds flat and closes with 0.3 N m.", how_it_works: "NOT STATED", distinction: "Pivot axis inside the cabinet side.", nearest_known: "Exterior hinges.", window_holds: "0.1 to 0.5 N m preload.", window_breaks: "Above 0.5 N m it slams.", extra_field: "ignored" };
seen.length = 0;
r = await post("/api/draft", { title: "Folding drawer hinge", description: desc, mechanism: card });
const p1 = seen.find((t) => /REQUIRED OUTPUT FORMAT/.test(t)) || "";
ok(r.status === 200 && /MECHANISM CARD/.test(p1) && /Pivot axis inside the cabinet side/.test(p1) && /CLAIM DERIVATION FROM THE MECHANISM CARD/.test(p1), "a supplied card and the derivation rules reach the drafting prompt", r.status);
ok(!/ignored/.test(p1), "unknown card fields are dropped");
ok(r.j.mechanism && r.j.mechanism.how_it_works === "NOT STATED" && r.j.mechanism_holes.some((h) => h.field === "how_it_works"), "the draft response carries the card and its holes", r.j.mechanism_holes);
seen.length = 0;
r = await post("/api/draft", { title: "Folding drawer hinge", description: desc });
const p2 = seen.find((t) => /REQUIRED OUTPUT FORMAT/.test(t)) || "";
ok(r.status === 200 && p2 && !/MECHANISM CARD/.test(p2) && r.j.mechanism === null && r.j.mechanism_holes.length === 0, "without a card the prompt has no card section", r.status);
for (const [re, l] of [[/never a law of nature, a mathematical relation or the result itself/, "means, not law or result"], [/names the structure that performs it/, "structure for every function"], [/only as wide as the description teaches/, "enabled range"]]) ok(re.test(p1) && re.test(p2), "every draft prompt carries the rule: " + l);
seen.length = 0;
r = await post("/api/draft", { title: "Folding drawer hinge", description: desc, mechanism: "not an object" });
ok(r.status === 200 && !/MECHANISM CARD/.test(seen.find((t) => /REQUIRED OUTPUT FORMAT/.test(t)) || ""), "a malformed card is ignored, the draft still runs");

// 5. The v=2 UI step: present on the page, hidden unless ?v=2, and the draft request carries the card only from it.
const page = await (await W.fetch(new Request("https://ipatent.qnfo.org/", { headers: { "User-Agent": UA } }), env, ctx)).text();
ok(/<div class="field" id="mechZone" style="display:none" data-mechanism-first="v2">/.test(page) && /id="mechBtn"/.test(page), "the landing page carries the hidden mechanism step");
ok(/get\('v'\) === '2'/.test(page) && /mechanism: mechCardValue\(\)/.test(page) && /if\(!MECH_V2 \|\| !mechFields\) return null;/.test(page), "only ?v=2 shows the step and only a read card is sent with the draft");
const scripts = page.split("<script>").slice(1).map((x) => x.split("</script>")[0]); // the page writes its inline scripts as exactly <script>
ok(scripts.length > 0 && scripts.every((sc) => { try { new Function(sc); return true; } catch (e) { return false; } }), "every inline page script parses");
console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
