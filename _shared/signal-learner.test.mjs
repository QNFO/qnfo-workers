// SIGNAL-LEARNING-1 offline suite. Run: node _shared/signal-learner.test.mjs
import { Learner, signalWeight, settle, tokens } from "./signal-learner.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
let t = 0; const L = new Learner({}, () => t);
const a = { title: "How black holes evaporate", source: "A" }, b = { title: "Celebrity gossip roundup", source: "B" };
ok(signalWeight({ completion: 1 }) === 1 && signalWeight({ completion: 0.05, elapsedS: 5 }) < 0 && signalWeight({ disliked: true }) === -2, "signal weights");
L.observe(a, signalWeight({ completion: 1 })); L.observe(b, signalWeight({ completion: 0.02, elapsedS: 5 }));
ok(L.score({ title: "black holes explained", source: "C" }) > L.score({ title: "celebrity news", source: "C" }), "watched terms rank above dropped terms");
ok(L.top(1).includes("black") && L.top(-1).includes("celebrity"), "top terms are learned, not fixed");
for (let i = 0; i < 3; i++) L.observe(b, -2, { explicit: true });
ok(L.banned.includes("B") && L.rank([a, b]).length === 1, "three strikes bans a source");
L.restore("B"); ok(!L.banned.includes("B"), "restore lifts a ban");
const before = L.score(a); t += 30 * 864e5; ok(Math.abs(L.score(a) - before / 2) < 0.01, "evidence halves each 30 days");
ok(L.rank([a, b], { explore: 0, rand: () => 0 })[0] === a, "rank puts the learned item first");
ok(JSON.stringify(new Learner(JSON.parse(JSON.stringify(L))).toJSON()) === JSON.stringify(L.toJSON()), "state round-trips");
ok(settle({ before: 1, after: 2 }).keep && !settle({ before: 2, after: 1 }).keep && !settle({ before: 1, after: 2, guards: [{ name: "cost", before: 1, after: 0 }] }).keep && !settle({ before: NaN, after: 1 }).keep, "settle keeps only on target gain with guards held");
ok(tokens("The Big Black Hole").includes("black hole"), "bigrams");
console.log(`signal-learner: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
