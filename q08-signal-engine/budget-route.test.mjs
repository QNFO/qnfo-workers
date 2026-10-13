// Q08-BUDGET-ROUTE-1 (0.24.0): a breached ai_spend cap puts the cheaper writers first; work never stops.
const G = (await import("./worker.js")).__gen;
let passes = 0, fails = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const env = (n, err) => ({ AUDIT: { prepare: () => ({ first: async () => { if (err) throw new Error("d1 down"); return { n }; } }) } });
const atCap = await G.composeOrder(env(1));
check("a breached cap puts kimi last", atCap[atCap.length - 1] === "@cf/moonshotai/kimi-k2.6" && atCap[0] !== "@cf/moonshotai/kimi-k2.6", atCap);
const clear = await G.composeOrder(env(0));
check("a clear cap keeps the default order", clear[0] === "@cf/moonshotai/kimi-k2.6", clear);
const origErr = console.error; console.error = () => {};
const down = await G.composeOrder(env(0, true));
console.error = origErr;
check("an unreadable budget reads as breached (cheap side)", down[0] !== "@cf/moonshotai/kimi-k2.6", down);
check("no AUDIT binding keeps the default order", (await G.composeOrder({}))[0] === "@cf/moonshotai/kimi-k2.6");
check("the at-cap list holds the same writers", G.COMPOSE_MODELS_AT_CAP.length === 3);
console.log("budget-route.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
