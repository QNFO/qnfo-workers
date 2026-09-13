#!/usr/bin/env node
// events-radar/apply-date-fix.mjs — added 2026-09-13 by qnfo-ops. Idempotent. Fails closed.
//
//   node apply-date-fix.mjs --check     # report, change nothing
//   node apply-date-fix.mjs --apply     # patch worker.js in place
//
// WHY A PATCHER: worker.js is 26,648 B; a hand-authored full-file rewrite could not be
// emitted reliably from the ops endpoint, and a reconstruction would risk shipping guessed
// code. Anchors below are copied from verbatim source (github_repo_read, sha aacdf94e).
//
// DEFECT A (F8, high) — INVERTED DATE RANGES
//   rangeRe2's leading group was (\\d{1,2}) with no digit boundary. In the live MPI-PKS text
//   "...Read more 05 Oct 2026 - 09 Oct 2026 Workshop..." it matched the TRAILING "26" of the
//   year 2026 rather than a day number, and push()'s single-month assumption then produced
//   startIso=2026-10-26 / endIso=2026-10-09 — an event that ends before it starts.
//   run_code verification (2026-09-13): groups ["26","09","Oct","2026"] -> inverted=true.
//   FIX: \\b and (?!\\d) on every day group.
//
// DEFECT B (medium) — SILENT DAY CLAMPING
//   push() used Math.min(d, 28), so days 29/30/31 became the 28th. Live corroboration: the
//   MPI-PKS source text says "31 Aug 2026 - 04 Sept 2026" while curated_json recorded
//   start AND end as "31 Aug 2026" and the report line read "[MPI-PKS] 31 Aug 2026".
//   FIX: clampDay() against the real month length (Feb 30 -> Feb 28, Oct 31 -> Oct 31).
//
// DEFECT C (medium) — NO CROSS-MONTH RANGES
//   push() applied one month to both ends. FIX: two cross-month regexes tried first, a shared
//   emit(), and an inversion guard that collapses endIso to startIso rather than ever
//   emitting an end before its start.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const NEW_VERSION = '1.0.2';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

let src = fs.readFileSync(WORKER, 'utf8');
const problems = [];
const applied = [];
let changed = 0;

const count = (s, lit) => s.split(lit).length - 1;

function swap(label, oldLit, newLit, expect) {
  const n = count(src, oldLit);
  if (n === 0 && count(src, newLit) > 0) { console.log('  skip  ' + label + ' (already applied)'); return; }
  if (n !== expect) { problems.push(label + ': anchor matched ' + n + 'x, expected ' + expect); return; }
  src = src.split(oldLit).join(newLit);
  applied.push(label);
  changed++;
  console.log('  fix   ' + label);
}

// ---------------------------------------------------------------- helpers (before extractEvents)
const HELP_OLD = String.raw`function pad2(n) { return String(n).padStart(2, "0"); }`;
const HELP_NEW = HELP_OLD + String.raw`

// v1.0.2: real month lengths, so days 29/30/31 are preserved (was a hard Math.min(d,28)).
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function clampDay(y, m, d) { return Math.max(1, Math.min(Number(d) || 1, daysInMonth(y, m))); }`;
swap('HELPERS: daysInMonth + clampDay', HELP_OLD, HELP_NEW, 1);

// ---------------------------------------------------------------- regex boundaries + cross-month
const RE_OLD = String.raw`  // range first: "Sep 13 - 18, 2026" | "13 - 18 Sep 2026"
  const rangeRe = new RegExp("(" + MONTH_RE + ")[a-z]*\\.?\\s+(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s*,?\\s*(20\\d{2})", "gi");
  const rangeRe2 = new RegExp("(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s+(" + MONTH_RE + ")[a-z]*\\.?\\s*,?\\s*(20\\d{2})", "gi");
  const singleRe = new RegExp("(" + MONTH_RE + ")[a-z]*\\.?\\s+(\\d{1,2})\\s*,?\\s*(20\\d{2})", "gi");
  const singleRe2 = new RegExp("(\\d{1,2})\\s+(" + MONTH_RE + ")[a-z]*\\.?\\s*,?\\s*(20\\d{2})", "gi");`;
const RE_NEW = String.raw`  // v1.0.2: every day group carries \b / (?!\d) so a 4-digit year's trailing digits can never
  // be captured as a day (that is what produced startIso 2026-10-26 > endIso 2026-10-09).
  // Cross-month patterns are tried FIRST so a range spanning two months wins over its two singles.
  const xRange1 = new RegExp("(" + MONTH_RE + ")[a-z]*\\.?\\s+(\\d{1,2})(?!\\d)\\s*,?\\s*(20\\d{2})\\s*[-–—]\\s*(\\d{1,2})(?!\\d)\\s+(" + MONTH_RE + ")[a-z]*\\.?\\s*,?\\s*(20\\d{2})", "gi");
  const xRange2 = new RegExp("\\b(\\d{1,2})(?!\\d)\\s+(" + MONTH_RE + ")[a-z]*\\.?\\s*,?\\s*(20\\d{2})\\s*[-–—]\\s*(\\d{1,2})(?!\\d)\\s+(" + MONTH_RE + ")[a-z]*\\.?\\s*,?\\s*(20\\d{2})", "gi");
  const rangeRe = new RegExp("(" + MONTH_RE + ")[a-z]*\\.?\\s+(\\d{1,2})(?!\\d)\\s*[-–—]\\s*(\\d{1,2})(?!\\d)\\s*,?\\s*(20\\d{2})", "gi");
  const rangeRe2 = new RegExp("\\b(\\d{1,2})(?!\\d)\\s*[-–—]\\s*(\\d{1,2})(?!\\d)\\s+(" + MONTH_RE + ")[a-z]*\\.?\\s*,?\\s*(20\\d{2})", "gi");
  const singleRe = new RegExp("(" + MONTH_RE + ")[a-z]*\\.?\\s+(\\d{1,2})(?!\\d)\\s*,?\\s*(20\\d{2})", "gi");
  const singleRe2 = new RegExp("\\b(\\d{1,2})(?!\\d)\\s+(" + MONTH_RE + ")[a-z]*\\.?\\s*,?\\s*(20\\d{2})", "gi");`;
swap('REGEXES: digit boundaries + cross-month patterns', RE_OLD, RE_NEW, 1);

// ---------------------------------------------------------------- emit() + inversion guard
const PUSH_OLD = String.raw`  const push = (mo, d1, d2, yr, idx) => {
    const mon = (mo || "").toLowerCase().slice(0, 3);
    const month = MONTHS[mon];
    if (!month) { discarded += 1; return; }
    const year = yr ? parseInt(yr, 10) : 0;
    if (year < cutYear || year > cutYear + 2) { discarded += 1; return; }
    const startIso = toISO(year, month, Math.min(d1 || 1, 28));
    const endIso = d2 ? toISO(year, month, Math.min(d2, 28)) : startIso;
    const key = src.name + "|" + startIso;
    if (seen.has(key)) return;
    const snippet = clean.slice(Math.max(0, idx - 80), idx + 200).slice(0, 240);
    if (dropGarbage(snippet)) { discarded += 1; return; }
    seen.add(key);
    const dateText = (d2 ? mo + " " + d1 + "-" + d2 + ", " + year : mo + " " + d1 + ", " + year);
    events.push({ venue: src.name, dateText, startIso, endIso, year, month, day: d1 || null, url: src.url, snippet, srcKind: src.kind, srcDelivery: src.delivery, srcCost: src.cost, srcDomains: (src.domains || []).slice() });
  };
  function toISO(y, m, d) { return y + "-" + pad2(m) + "-" + pad2(d); }`;
const PUSH_NEW = String.raw`  function toISO(y, m, d) { return y + "-" + pad2(m) + "-" + pad2(d); }

  // Shared emit path. Invariant enforced: endIso >= startIso. A range that parses backwards
  // collapses to a single day rather than emitting an event that ends before it starts.
  const emit = (mo1, d1, y1, mo2, d2, y2, idx, dateText) => {
    const month = MONTHS[(mo1 || "").toLowerCase().slice(0, 3)];
    if (!month) { discarded += 1; return; }
    const year = y1 ? parseInt(y1, 10) : 0;
    if (year < cutYear || year > cutYear + 2) { discarded += 1; return; }
    const startIso = toISO(year, month, clampDay(year, month, d1 || 1));
    let endIso = startIso;
    if (d2 && mo2) {
      const month2 = MONTHS[(mo2 || "").toLowerCase().slice(0, 3)];
      const year2 = y2 ? parseInt(y2, 10) : year;
      if (month2) endIso = toISO(year2, month2, clampDay(year2, month2, d2));
    }
    if (endIso < startIso) endIso = startIso;
    const key = src.name + "|" + startIso;
    if (seen.has(key)) return;
    const snippet = clean.slice(Math.max(0, idx - 80), idx + 200).slice(0, 240);
    if (dropGarbage(snippet)) { discarded += 1; return; }
    seen.add(key);
    events.push({ venue: src.name, dateText, startIso, endIso, year, month, day: d1 || null, url: src.url, snippet, srcKind: src.kind, srcDelivery: src.delivery, srcCost: src.cost, srcDomains: (src.domains || []).slice() });
  };
  const push = (mo, d1, d2, yr, idx) => {
    const dt = (d2 ? mo + " " + d1 + "-" + d2 + ", " + yr : mo + " " + d1 + ", " + yr);
    emit(mo, d1, yr, d2 ? mo : null, d2, yr, idx, dt);
  };`;
swap('EMIT: clampDay + inversion guard + cross-month push', PUSH_OLD, PUSH_NEW, 1);

// ---------------------------------------------------------------- scan loops
const LOOP_OLD = String.raw`  for (const m of clean.matchAll(rangeRe)) push(m[1], parseInt(m[2], 10), parseInt(m[3], 10), m[4], m.index);
  for (const m of clean.matchAll(rangeRe2)) push(m[3], parseInt(m[1], 10), parseInt(m[2], 10), m[4], m.index);
  for (const m of clean.matchAll(singleRe)) push(m[1], parseInt(m[2], 10), null, m[3], m.index);
  for (const m of clean.matchAll(singleRe2)) push(m[2], parseInt(m[1], 10), null, m[3], m.index);`;
const LOOP_NEW = String.raw`  // cross-month ranges first (two months, two years)
  for (const m of clean.matchAll(xRange1)) emit(m[1], parseInt(m[2], 10), m[3], m[5], parseInt(m[4], 10), m[6], m.index, m[1] + " " + m[2] + " - " + m[5] + " " + m[4] + ", " + m[3]);
  for (const m of clean.matchAll(xRange2)) emit(m[2], parseInt(m[1], 10), m[3], m[5], parseInt(m[4], 10), m[6], m.index, m[2] + " " + m[1] + " - " + m[5] + " " + m[4] + ", " + m[3]);
  // same-month ranges
  for (const m of clean.matchAll(rangeRe)) push(m[1], parseInt(m[2], 10), parseInt(m[3], 10), m[4], m.index);
  for (const m of clean.matchAll(rangeRe2)) push(m[3], parseInt(m[1], 10), parseInt(m[2], 10), m[4], m.index);
  // single dates
  for (const m of clean.matchAll(singleRe)) push(m[1], parseInt(m[2], 10), null, m[3], m.index);
  for (const m of clean.matchAll(singleRe2)) push(m[2], parseInt(m[1], 10), null, m[3], m.index);`;
swap('LOOPS: cross-month scan before singles', LOOP_OLD, LOOP_NEW, 1);

// ---------------------------------------------------------------- version
swap('VERSION 1.0.1 -> ' + NEW_VERSION, 'const VERSION = "1.0.1";', 'const VERSION = "' + NEW_VERSION + '";', 1);

// ---------------------------------------------------------------- outcome
console.log('\n' + changed + ' change(s) pending, ' + problems.length + ' problem(s)');
if (problems.length) {
  console.error('\nREFUSING TO WRITE:');
  problems.forEach(p => console.error('  ! ' + p));
  process.exit(2);
}
if (!apply) {
  console.log('--check only; nothing written. Re-run with --apply.');
  process.exit(0);
}
fs.writeFileSync(WORKER, src, 'utf8');
console.log('WROTE ' + WORKER + '\n');
console.log('Applied: ' + applied.join(', '));
console.log('\nPost-deploy acceptance (D1 qnfo-audit.events_radar, newest slug):');
console.log('  1. GET /health -> version ' + NEW_VERSION);
console.log('  2. No event may have startIso > endIso:');
console.log('     SELECT slug, json_extract(value,\'$.startIso\') s, json_extract(value,\'$.endIso\') e');
console.log('       FROM events_radar, json_each(events_radar.events_json) WHERE s > e;   -- expect 0 rows');
console.log('  3. MPI-PKS 31 Aug / 30 Sep events must show day 31 / 30, not 28.');
console.log('  4. "05 Oct 2026 - 09 Oct 2026" must appear as one range, not a 26 Oct event.');
