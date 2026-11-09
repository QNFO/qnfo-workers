// UX-COVERAGE-MAP-1 (issue 8512): every user-facing surface maps to a journey file, and the committed map is current.
import fs from "node:fs";
import { buildMap } from "./ux-journeys/coverage-map.mjs";
let fail = 0;
const ok = (n, c) => { if (c) console.log("  ok   " + n); else { fail++; console.log("  FAIL " + n); } };
const map = await buildMap();
const committed = fs.readFileSync(new URL("./ux-journeys/coverage-map.md", import.meta.url), "utf8");
ok("coverage-map.md is current (run coverage-map.mjs --write)", committed === map);
ok("me.q08.org/companion has a journey", /\| me\.q08\.org\/companion \|/.test(committed));
const { HOSTS } = await import("./ux-journeys/apps/public.journeys.mjs");
ok("every public host is in the map", HOSTS.every((h) => committed.includes("| " + h[0] + " |")));
process.exit(fail ? 1 : 0);
