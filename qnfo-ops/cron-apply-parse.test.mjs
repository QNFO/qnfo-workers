// CRON-APPLY-PARSE-1 (qnfo-ops 2.38.38): the canonical deploy applies the crons a worker's wrangler.toml declares in
// [triggers], read from the `crons = [...]` assignment, never from the first "crons" in a comment.
// Run: node qnfo-ops/cron-apply-parse.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- CRON-APPLY-PARSE-1:BEGIN"), src.indexOf("// ---- CRON-APPLY-PARSE-1:END"));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(block + "\n__export = { tomlDeclaredCrons };", sandbox);
const { tomlDeclaredCrons } = sandbox.__export;

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " -- " + JSON.stringify(d) : "")); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The shapes that broke the old indexOf("crons") parse (2026-10-02: radar-hub, qnfo-cloud-ops, qnfo-fleet-dashboard).
const commentFirst = '# the radar reads its weekly sources only on Mondays. Same count of crons (net-zero).\n[triggers]\ncrons = ["0 5 * * 2", "30 8 * * *"]\n';
ok(eq(tomlDeclaredCrons(commentFirst), ["0 5 * * 2", "30 8 * * *"]), "P1 a comment that says crons before [triggers] is not the list");
const oldParse = (wt) => { const ci = wt.indexOf("crons"); const a = ci >= 0 ? wt.indexOf("[", ci) : -1; const b = a >= 0 ? wt.indexOf("]", a) : -1; const out = []; if (a >= 0 && b > a) { const p = wt.slice(a + 1, b).split('"'); for (let i = 1; i < p.length; i += 2) if (p[i]) out.push(p[i]); } return out; };
ok(eq(oldParse(commentFirst), []), "P2 the old parse read nothing from that file (the defect, reproduced)");
ok(eq(tomlDeclaredCrons('[triggers]\ncrons = [\n  "15 4 * * *", # nightly\n  # "0 0 * * *" retired\n  "0 6,12 * * 2-6",\n]\n'), ["15 4 * * *", "0 6,12 * * 2-6"]), "P3 a multi-line list with comments keeps only the live entries");
ok(tomlDeclaredCrons('name = "x"\nmain = "worker.js"\n') === null, "P4 no crons key: null (nothing to apply)");
ok(eq(tomlDeclaredCrons('[triggers]\ncrons = []\n'), []), "P5 an explicit empty list is []");
ok(tomlDeclaredCrons('[vars]\ncrons = ["0 * * * *"]\n') === null, "P6 a crons key outside [triggers] is not a trigger");
ok(eq(tomlDeclaredCrons("[triggers] # schedules\ncrons = ['*/15 * * * *']\n"), ["*/15 * * * *"]), "P7 single quotes and a comment after the section header");
ok(eq(tomlDeclaredCrons('[triggers]\r\ncrons = ["0 3 * * *"]\r\n'), ["0 3 * * *"]), "P8 CRLF line endings");
ok(eq(tomlDeclaredCrons('[[services]]\nbinding = "A"\n[triggers]\n  crons = ["0 1 * * *"]\n'), ["0 1 * * *"]), "P9 an indented key after an array-of-tables section");

// Every live worker's wrangler.toml: a [triggers] section parses into well-formed 5-field crons.
const CRON = /^\S+ \S+ \S+ \S+ \S+$/;
let swept = 0;
for (const d of readdirSync(root, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name.startsWith(".")) continue;
  const f = join(root, d.name, "wrangler.toml");
  if (!existsSync(f) || existsSync(join(root, d.name, "RETIRED")) || existsSync(join(root, d.name, "FOLDED"))) continue;
  const wt = readFileSync(f, "utf8");
  if (!/^\s*\[triggers\]/m.test(wt) || !/^\s*crons\s*=/m.test(wt)) continue;
  swept++;
  const got = tomlDeclaredCrons(wt);
  ok(Array.isArray(got) && got.length > 0 && got.every((c) => CRON.test(c)), "S " + d.name + " declares well-formed crons", got);
}
ok(swept >= 10, "S0 the sweep saw the fleet's scheduled workers", swept);
const rh = tomlDeclaredCrons(readFileSync(join(root, "radar-hub", "wrangler.toml"), "utf8"));
// CRON-SINGLE-TRIGGER-1 (#513) moved radar-hub's 9 crons into worker.js CRON_TABLE; the comment above its one trigger
// still lists them, so this also proves a comment inside [triggers] is not read as the list.
ok(eq(rh, ["0 * * * *"]), "R1 radar-hub: the single hourly trigger, not the former list in its comment", rh);
const co = tomlDeclaredCrons(readFileSync(join(root, "qnfo-cloud-ops", "wrangler.toml"), "utf8"));
// CRON-SINGLE-TRIGGER-1 (qnfo-cloud-ops 1.19.0, #510) folded its 21 per-slot crons into one 10-minute tick.
ok(eq(co, ["*/10 * * * *"]), "R2 qnfo-cloud-ops: the single */10 tick", co);
const fd = tomlDeclaredCrons(readFileSync(join(root, "qnfo-fleet-dashboard", "wrangler.toml"), "utf8"));
ok(eq(fd, ["*/15 * * * *"]), "R3 qnfo-fleet-dashboard: */15", fd);

// Wiring: the deploy path uses the parser, and the old indexOf parse is gone.
ok(/var crons = tomlDeclaredCrons\(wt\) \|\| \[\];/.test(src), "W1 the canonical deploy reads crons through tomlDeclaredCrons");
ok(src.indexOf('wt.indexOf("crons")') < 0, "W2 the comment-matching parse is gone");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
