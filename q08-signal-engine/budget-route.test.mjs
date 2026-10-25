// Q08-BUDGET-ROUTE-1 (0.24.0): a breached ai_spend cap puts the cheaper writers first; work never stops.
const G = (await import("./worker.js")).__gen;
let passes = 0, fails = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const env = (n, err) => ({ AUDIT: { prepare: () => ({ first: async () => { if (err) throw new Error("d1 down"); return { n }; } }) } });
const atCap = await G.composeOrder(env(1));
check("a breached cap keeps the lowest-cost, highest-yield writer first", atCap[0] === "@cf/openai/gpt-oss-120b", atCap);
check("a breached cap tries the lower-cost fallback before kimi", atCap[1] === "@cf/nvidia/nemotron-3-120b-a12b" && atCap[2] === "@cf/moonshotai/kimi-k2.6", atCap);
const clear = await G.composeOrder(env(0));
// Q08-YIELD-ORDER-1: the assertion is "a clear cap keeps the DEFAULT order", not "kimi is first". Comparing identity with the
// module's own default keeps the test meaningful while model ORDER stays a tunable (it is now set by measured publish yield).
check("a clear cap keeps the default order", clear.join() === G.COMPOSE_MODELS.join(), clear);
check("uncapped fallback prefers measured writer yield", clear.join() === ["@cf/openai/gpt-oss-120b", "@cf/moonshotai/kimi-k2.6", "@cf/nvidia/nemotron-3-120b-a12b"].join(), clear);
const origErr = console.error; console.error = () => {};
const down = await G.composeOrder(env(0, true));
console.error = origErr;
check("an unreadable budget reads as breached (cheap side)", down.join() === G.COMPOSE_MODELS_AT_CAP.join(), down);
check("no AUDIT binding keeps the default order", (await G.composeOrder({})).join() === G.COMPOSE_MODELS.join());
check("the at-cap list holds the same writers", G.COMPOSE_MODELS_AT_CAP.length === 3);
check("the cap switches fallback order without changing the writer pool", atCap[0] === clear[0] && atCap[1] !== clear[1] && atCap.slice().sort().join() === clear.slice().sort().join(), { atCap, clear });
console.log("budget-route.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
