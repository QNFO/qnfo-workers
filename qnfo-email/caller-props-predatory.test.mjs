// qnfo-email 2.5.1 offline fixtures: EMAIL-CALLER-PROPS-1 (#1923) and PREDATORY-BODY-1 (#1924). No network, synthetic data.
// Proves: (1) an internal service binding that declares props.caller passes the key check on authenticated routes, a
// request without props and without a key is still refused, malformed callers do not authenticate, the key still works;
// (2) heuristicSpam reads the body: the bland-subject pitch seen live on 2026-10-03 (email 915) is spam, a colleague's
// real mail that mentions a journal is not, and academic sender domains stay exempt.
// Run: node qnfo-email/caller-props-predatory.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const api = new Function(src.replace(/export default\{/, "const __handler={") +
  "\nreturn {handler:__handler,heuristicSpam,predatoryBody,internalCaller,VERSION};")();
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra) : "")); } };

// ---- 1. caller props on the authenticated routes ----
const queueDb = { prepare: () => { const st = { bind: () => st, all: async () => ({ results: [{ decision: "skip", c: 1 }] }), first: async () => null, run: async () => ({ meta: { changes: 0 } }) }; return st; } };
const env = { AUDIT_DB: queueDb, GATEWAY_EMAIL_KEY: "gw-key" };
const get = (path, headers, ctx) => api.handler.fetch(new Request("https://email.internal" + path, { headers: headers || {} }), env, ctx);
{
  const r = await get("/queue", {}, { props: { caller: "personal-companion" } });
  ok(r.status === 200, "a binding with props.caller passes the key check", r.status);
  const n = await get("/queue", {}, {});
  const u = await get("/queue", {}, undefined);
  ok(n.status === 401 && u.status === 401, "no props and no key is refused (the 401 personal-companion saw)", [n.status, u.status]);
  const e = await get("/queue", { authorization: "Bearer " }, {});
  ok(e.status === 401, "an empty bearer (an unset EMAIL_API_KEY) is refused", e.status);
  const bad = await get("/queue", {}, { props: { caller: "Not A Worker!" } });
  const num = await get("/queue", {}, { props: { caller: 7 } });
  ok(bad.status === 401 && num.status === 401, "malformed or non-string callers do not authenticate", [bad.status, num.status]);
  const k = await get("/queue", { authorization: "Bearer gw-key" }, {});
  ok(k.status === 200, "the GATEWAY_EMAIL_KEY bearer still works", k.status);
  const h = await (await get("/health", {}, {})).json();
  ok(h.version === api.VERSION && /^2\.5\.[1-9]/.test(h.version) && /props\.caller/.test(h.limitations[0]), "health reports 2.5.1+ and names the props path", h.version);
  ok(api.internalCaller({ props: { caller: "radar-hub" } }) === "radar-hub" && api.internalCaller(null) === "", "internalCaller returns the caller name or empty");
}

// ---- 2. body-aware predatory heuristic ----
const b915 = "Dear Colleague,\n\nI'm writing because your work may fit an interdisciplinary journal.\n\nThe journal is Scopus approved and accepts multidisciplinary research\nacross all subject areas.\n\nWe welcome research that connects ideas or methods across disciplines,\nincluding substantial manuscript-based work.\n\nHappy to share the details if useful.\n\nJournal Team,";
ok(api.heuristicSpam("ameliahughes@advancedresearchpub.com", "A journal for interdisciplinary research", b915) === true, "the bland-subject pitch of email 915 is spam because of its body");
ok(api.heuristicSpam("someone12@gmail.com", "Your research publication plans", "Dear Colleague, the journal is Scopus approved and accepts multidisciplinary research across all subject areas.") === true, "a gmail.com sender with the same pitch is spam (domain lists cannot cover it)");
ok(api.heuristicSpam("ameliahughes@advancedresearchpub.com", "A journal for interdisciplinary research", "") === false, "subject alone stays non-spam (the old behaviour for a bland subject)");
ok(api.heuristicSpam("prof@physics.example.edu", "A journal for interdisciplinary research", b915) === false, "academic sender domains stay exempt");
const colleague = "Dear Rowan,\n\nThanks for the preprint. I read it with interest; the multidisciplinary angle is nice. Have you thought about which journal to submit it to? Happy to discuss.\n\nBest, Anna";
ok(api.heuristicSpam("anna@lab.example.org", "Re: your preprint", colleague) === false, "a named correspondent who mentions a journal is not spam (no generic salutation)");
ok(api.heuristicSpam("editor@journal.example.org", "Decision on your manuscript", "Dear Author, your manuscript has been accepted for publication in the Journal.") === false, "an editorial decision without an indexing or scope claim is not spam");
ok(api.predatoryBody("<p>Dear Researcher,</p><p>Our journal is indexed in <b>Scopus</b>. Submit your manuscript today.</p>") === true, "HTML bodies are read as text");
ok(api.heuristicSpam("x@y.example", "Invitation to submit your manuscript", "") === true, "the subject rules still apply");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
