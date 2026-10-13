// Q08-FINAL-READ-1 (0.21.0): the published text is read last, with a floor and a fail-closed panel.
const mod = await import("./worker.js");
const A = mod.__analysis;
let passes = 0, fails = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
const para = "Disney offered twenty million dollars for the assets of the chatbot company, and the court will hear only that bid unless a rival appears before the deadline set in the filing. ";
const long = "# T\n\n" + Array.from({ length: 6 }, () => para.repeat(3)).join("\n\n") + "\n\nworth your time: yes - x";
const env = (score) => ({ AI: { run: async () => ({ response: JSON.stringify({ would_read_to_end: score >= 4, score, slop_tells: score < 4 ? ["the loop"] : [], fix: "name who gains" }) }) } });
check("PUBLISH_MIN_CHARS is at least 2800", A.PUBLISH_MIN_CHARS >= 2800);
const short = await A.finalRead(env(5), "# T\n\n" + para + "\n\nworth your time: yes - x", "@cf/nvidia/nemotron-3-120b-a12b", "s");
check("a stub is refused before any reader is asked", !short.ok && /too short to publish/.test(short.problems[0]), short);
const good = await A.finalRead(env(4), long, "@cf/nvidia/nemotron-3-120b-a12b", "s");
check("a long piece both readers score 4 passes", good.ok === true && good.rows.length >= 2, good);
const vac = await A.finalRead(env(3), long, "@cf/nvidia/nemotron-3-120b-a12b", "s");
check("a piece the readers score 3 is not published, and the reason names the vacuous phrases", !vac.ok && /not worth publishing/.test(vac.problems[0]) && /the loop/.test(vac.problems[0]), vac);
const down = await A.finalRead({ AI: { run: async () => { throw new Error("down"); } } }, long, "@cf/nvidia/nemotron-3-120b-a12b", "s");
check("no reader verdict fails closed", !down.ok && /fails closed/.test(down.problems[0]), down);
console.log("final-read.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
