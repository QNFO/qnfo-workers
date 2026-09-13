// personal-companion/lib/gate.js
//
// Added 2026-09-13 by qnfo-ops. Pure function: no bindings, no I/O, no network.
//
// WHY: grounding.js (quantities) and voice.js (attribution) each return their own
// violation array, and publishPolicy takes one. Wiring three calls at the insert
// site invites the mistake the whole patch exists to prevent - checking one class
// and publishing on the other. This composes them so there is exactly one call.
//
// REVISION 2 (2026-09-13, same day) — addressee added, after measuring a hole
// Revision 1 composed grounding + voice only. voice.js catches the reader named as
// the subject of an experience verb, and it catches a STRAIGHT-apostrophe possessive.
// Measured, by executing the committed voice.js against the real rejection text of
// companion_runs id=442:
//
//   "# Field Notes for Rowan\n\n## Notation Systems..." (as emitted, straight apostrophe)
//     -> 1 violation, kind reader-as-subject ("Rowan's")
//   same text with a TYPOGRAPHIC apostrophe (Rowan\u2019s)
//     -> 0 violations
//
// So revision 1 blocked that run for the possessive, not for the heading — and a
// writer that heads a piece "# Field Notes for Rowan" without a straight-apostrophe
// possessive passed the gate with zero voice violations. addressee.js closes that:
// the same text yields 2 blocking violations (reader-in-heading, reader-address).
//
// IMPORTANT: only the BLOCKING subset of addressee violations is merged into the
// array publishPolicy sees. A bare mention is a warning, because the serial "The
// Hand That Signs" legitimately names the reader in order to exclude him ("Rowan's
// own handwriting is not the subject here."). Merging warnings would block that
// piece — a false block, which is as damaging as a false pass. Warnings are returned
// separately as `addressee` for a human or a policy to review.
//
// Effect on the existing contract, measured: for the live fixture the addressee
// blocking count is 0 and the warning count is 1, so `violations` stays at 7 and
// every assertion in gate.test.js revision 1 still holds.
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
// CONTRACT: decision = { publish, gate, reason, violations, grounding, voice,
//                        addressee, addresseeBlocking }
//   publish === false  ->  do not serve. A gap in the page is preferred to an
//                          ungrounded piece; the rhythm refills it next day.
//   addressee          ->  ALL addressee findings, including warnings. Review signal.
//   addresseeBlocking  ->  the subset merged into `violations`. Blocking.

import { checkGrounding, publishPolicy, deriveTemporalFacts } from './grounding.js';
import { checkVoice, venuesOf, mergeViolations } from './voice.js';
import { checkAddressee, blockingViolations } from './addressee.js';

export function runGate(o) {
  const opts = o || {};
  const body = String(opts.body || '');
  const facts = opts.facts || deriveTemporalFacts(opts.kbRows || []);
  const kbRows = opts.kbRows || [];
  const names = opts.names && opts.names.length ? opts.names : ['Rowan'];

  const grounding = checkGrounding(body, facts);
  const voice = checkVoice(body, { names: names, venues: venuesOf(kbRows) });
  const addressee = checkAddressee(body, { names: names });
  const addresseeBlocking = blockingViolations(addressee);

  const violations = mergeViolations(grounding, voice, addresseeBlocking);
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
    voice: voice,
    addressee: addressee,
    addresseeBlocking: addresseeBlocking
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
