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
// The radar-hub shape after CRON-SINGLE-TRIGGER-1 (#513): a comment inside [triggers] lists the former crons.
ok(eq(tomlDeclaredCrons('[triggers]\n# CRON-SINGLE-TRIGGER-1: worker.js CRON_TABLE holds the former list\n# (0 5 * * 2, 30 8 * * *, "0 6 1 * *")\ncrons = ["0 * * * *"]\n'), ["0 * * * *"]), "P10 a comment inside [triggers] that lists crons is not the list");

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
// An independent reference reader (section scan + regex), so the sweep checks the parser against a second
// implementation rather than against any worker's current cron count, which other changes move (CRON-SINGLE-TRIGGER-1
// collapsed qnfo-cloud-ops from 21 crons to one the minute after this suite first ran on main).
function refCrons(wt) {
  const sec = /^\s*\[triggers\][^\n]*$/m.exec(wt);
  if (!sec) return null;
  const rest = wt.slice(sec.index + sec[0].length);
  const next = /^\s*\[/m.exec(rest);
  const body = next ? rest.slice(0, next.index) : rest;
  const m = /^\s*crons\s*=\s*\[([\s\S]*?)\]/m.exec(body);
  if (!m) return null;
  return [...m[1].replace(/#[^\n]*/g, "").matchAll(/"([^"]*)"|'([^']*)'/g)].map((x) => x[1] ?? x[2]).filter(Boolean);
}
let cross = 0;
for (const d of readdirSync(root, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name.startsWith(".")) continue;
  const f = join(root, d.name, "wrangler.toml");
  if (!existsSync(f) || existsSync(join(root, d.name, "RETIRED")) || existsSync(join(root, d.name, "FOLDED"))) continue;
  const wt = readFileSync(f, "utf8");
  const ref = refCrons(wt);
  if (ref === null) continue;
  cross++;
  ok(eq(tomlDeclaredCrons(wt), ref), "X " + d.name + " matches the reference reader", { got: tomlDeclaredCrons(wt), ref });
}
ok(cross >= 10, "X0 the cross-check covered the scheduled workers", cross);
// The three workers whose crons the old parse never applied (2026-10-02) now parse to a non-empty list.
for (const w of ["radar-hub", "qnfo-cloud-ops", "qnfo-fleet-dashboard"]) {
  const got = tomlDeclaredCrons(readFileSync(join(root, w, "wrangler.toml"), "utf8"));
  ok(Array.isArray(got) && got.length > 0, "R " + w + " declares at least one cron", got);
}

// Wiring: the deploy path uses the parser, and the old indexOf parse is gone.
ok(/var crons = tomlDeclaredCrons\(wt\) \|\| \[\];/.test(src), "W1 the canonical deploy reads crons through tomlDeclaredCrons");
ok(src.indexOf('wt.indexOf("crons")') < 0, "W2 the comment-matching parse is gone");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
