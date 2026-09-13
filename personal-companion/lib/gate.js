// personal-companion/lib/gate.js
//
// Added 2026-09-13 by qnfo-ops. Pure function: no bindings, no I/O, no network.
//
// WHY: grounding.js (quantities) and voice.js (attribution) each return their own
// violation array, and publishPolicy takes one. Wiring three calls at the insert
// site invites the mistake the whole patch exists to prevent - checking one class
// and publishing on the other. This composes them so there is exactly one call.
//
// USAGE (inside the compose pipeline, after `critique`, before the INSERT into
// companion_pieces):
//
//   var facts = deriveTemporalFacts(activityRows);
//   var decision = runGate({
//     body:    piece.body_md,
//     quality: quality,        // parsed critique JSON
//     facts:   facts,
//     kbRows:  activityRows,   // same rows, for venue scoping
//     forced:  wasForced       // true when the code validator never passed
//   });
//   if (!decision.publish) {
//     // store the row for audit, but tag it and exclude it from the index,
//     // /api/pieces, /api/piece/<slug> and feed.xml.
//     quality.gate = decision.gate;
//     quality.gate_reason = decision.reason;
//   }
//
// CONTRACT: decision = { publish, gate, reason, violations, grounding, voice }
//   publish === false  ->  do not serve. A gap in the page is preferred to an
//                          ungrounded piece; the rhythm refills it next day.

import { checkGrounding, publishPolicy, deriveTemporalFacts } from './grounding.js';
import { checkVoice, venuesOf, mergeViolations } from './voice.js';

export function runGate(o) {
  const opts = o || {};
  const body = String(opts.body || '');
  const facts = opts.facts || deriveTemporalFacts(opts.kbRows || []);
  const kbRows = opts.kbRows || [];

  const grounding = checkGrounding(body, facts);
  const voice = checkVoice(body, {
    names: opts.names && opts.names.length ? opts.names : ['Rowan'],
    venues: venuesOf(kbRows)
  });

  const violations = mergeViolations(grounding, voice);
  const decision = publishPolicy({
    quality: opts.quality || {},
    violations: violations,
    forced: !!opts.forced
  });

  return {
    publish: decision.publish,
    gate: decision.gate,
    reason: decision.reason,
    violations: violations,
    grounding: grounding,
    voice: voice
  };
}

// Re-verify an ALREADY PUBLISHED row. Used by the QRI-1 correction pass to decide
// which existing pieces must be withdrawn.
//
// This exists because the tempting shortcut - withdraw every piece whose critic
// verdict is "reject" - would have withdrawn 6 of the 7 live pieces. P_CRITIQUE
// asks the critic to look for reasons the piece is worthless, so "reject" is its
// expected output and is not evidence of a bad piece. The correction must be driven
// by measured violations against the record.
export function auditPublishedPiece(row, kbRows, names) {
  const rows = kbRows || [];
  return runGate({
    body: row && row.body_md,
    quality: parseQuality(row && row.quality_json),
    facts: deriveTemporalFacts(rows),   // never default to empty: empty facts would
    kbRows: rows,                       // silently pass every claim. See gate.test.js.
    forced: false,
    names: names || ['Rowan']
  });
}

function parseQuality(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (e) { return {}; }
}
