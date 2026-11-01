// Q08-BUDGET-ROUTE-1: budget pressure enables one low-cost writer attempt before the measured-yield fallback order.
const G = (await import("./worker.js")).__gen;
let passes = 0, fails = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const env = (n, err) => ({ AUDIT: { prepare: () => ({ first: async () => { if (err) throw new Error("d1 down"); return { n }; } }) } });
const capEnv = env(1);
const atCap = await G.composeOrder(capEnv);
check("a breached fleet budget sets soft routing pressure", capEnv.__q08BudgetPressure === true);
// Q08-WRITER-ORDER-2 (0.36.0): the order follows end-to-end publish yield (engine_runs, 14 days to 2026-10-26: nemotron 10.2%, gpt-oss 1.7%, kimi 0.9%),
// not the writer-gate pass rate, and a breached spend cap does not move a lower-yield writer ahead of a higher-yield one.
check("a breached cap keeps the highest end-to-end yield writer first", atCap[0] === "@cf/nvidia/nemotron-3-120b-a12b", atCap);
check("a breached cap tries gpt-oss before kimi", atCap[1] === "@cf/openai/gpt-oss-120b" && atCap[2] === "@cf/moonshotai/kimi-k2.6", atCap);
const clear = await G.composeOrder(env(0));
// Q08-YIELD-ORDER-1: the assertion is "a clear cap keeps the DEFAULT order", not "kimi is first". Comparing identity with the
// module's own default keeps the test meaningful while model ORDER stays a tunable (it is now set by measured publish yield).
check("a clear cap keeps the default order", clear.join() === G.COMPOSE_MODELS.join(), clear);
check("uncapped order follows measured end-to-end yield", clear.join() === ["@cf/nvidia/nemotron-3-120b-a12b", "@cf/openai/gpt-oss-120b", "@cf/moonshotai/kimi-k2.6"].join(), clear);
const origErr = console.error; console.error = () => {};
const downEnv = env(0, true);
const down = await G.composeOrder(downEnv);
console.error = origErr;
check("an unreadable budget reads as breached (cheap side)", down.join() === G.COMPOSE_MODELS_AT_CAP.join(), down);
check("an unreadable fleet budget sets soft routing pressure", downEnv.__q08BudgetPressure === true);
check("no AUDIT binding keeps the default order", (await G.composeOrder({})).join() === G.COMPOSE_MODELS.join());
check("the at-cap list holds the same writers", G.COMPOSE_MODELS_AT_CAP.length === 3);
check("the cap changes the call, not the writer pool or the yield ranking", atCap.join() === clear.join() && atCap.slice().sort().join() === clear.slice().sort().join(), { atCap, clear });
// ops_config q08_compose_order overrides without a deploy; unknown ids are ignored and every writer stays available as a fallback
const NEMO = "@cf/nvidia/nemotron-3-120b-a12b", OSS = "@cf/openai/gpt-oss-120b", KIMI = "@cf/moonshotai/kimi-k2.6";
const envCfg = (value, n) => ({ AUDIT: { prepare: (sql) => ({ bind: () => ({ first: async () => (/ops_config/.test(sql) ? (value === undefined ? null : { value }) : { n: n || 0 }) }), first: async () => ({ n: n || 0 }) }) } });
check("an override puts the named writers first and appends the rest", (await G.composeOrder(envCfg(KIMI + "," + OSS))).join() === [KIMI, OSS, NEMO].join());
check("an override wins over the cap", (await G.composeOrder(envCfg(OSS, 1))).join() === [OSS, NEMO, KIMI].join());
check("unknown ids and duplicates are ignored", (await G.composeOrder(envCfg("gpt-4, " + OSS + " ," + OSS + ",foo"))).join() === [OSS, NEMO, KIMI].join());
check("an empty or unusable override keeps the default order", (await G.composeOrder(envCfg(" , gpt-4"))).join() === G.COMPOSE_MODELS.join() && (await G.composeOrder(envCfg(undefined))).join() === G.COMPOSE_MODELS.join());
check("parseComposeOrder is exported for the suite and returns null for nothing usable", typeof G.parseComposeOrder === "function" && G.parseComposeOrder("") === null && G.parseComposeOrder(null) === null);
console.log("budget-route.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
