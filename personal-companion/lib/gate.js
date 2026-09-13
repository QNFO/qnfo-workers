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
// piece — a false block, which is as damaging as a false pass.
//
// REVISION 3 (2026-09-13, QRI-2) — the false block rev 2 left standing
// Rev 2 filtered ADDRESSEE warnings but merged `voice` into `violations`
// UNFILTERED. voice.js rev 2 carries no severity, so every voice finding blocked —
// including check 3, which voice.js's own header calls "a review flag, not proof
// of impersonation", and check 1, which its header records as firing on the
// abstract "my attention". Rev 2's own note above states the goal that the serial
// must not be blocked; that goal was NOT met, because the block came from voice.js,
// not from addressee.js. Measured with the committed modules:
//
//   companion_pieces.id=7 disclaimer  -> voice: 2 violations
//                                        [impersonation] "my attention"
//                                        [reader-as-subject] "Rowan's"
//                                        => rev 2 still returned publish=false
//
// MEASURED, 3/3 (run_code against the PERSONAL.activity rows, 2026-09-13):
//   companion_pieces.id=8  -> publish=false, 7 blocking (2 grounding + 5 voice)
//   companion_pieces.id=7  -> publish=true,  0 blocking, 3 warnings
//   runs id=442 heading    -> publish=false, 2 blocking (reader-in-heading, reader-address)
//   rev 2 on the same three: false / FALSE / false   (one wrong)
//
// REVISION 4 (same day) — do not depend on the detector revision that is deployed
// Rev 3 filtered voice on `severity === 'warn'`, which only works once voice.js
// rev 3 (severity field) is deployed. A write of voice.js rev 3 was rejected by a
// concurrent writer on that path, and a gate that silently no-ops when its
// detector is one revision behind is worse than no gate — the false block would
// persist while the code read as if it were fixed. Rev 4 therefore treats the two
// documented review flags as review flags by KIND as well as by severity:
//
//   impersonation, reader-as-subject  -> warning  (review flags; voice.js header)
//   attribution-seam, invented-particular -> blocking (the shipped defect class)
//
// The mapping is correct against voice.js rev 2 (no severity field) and rev 3
// (severity field), so the gate's behaviour no longer depends on which detector
// revision happens to be live. The policy lives in the composition layer, which is
// where it belongs: the detector reports findings, the gate decides what blocks.
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
// CONTRACT: decision = { publish, gate, reason, violations, warnings, grounding,
//                        voice, addressee, addresseeBlocking }
//   publish === false  ->  do not serve. A gap in the page is preferred to an
//                          ungrounded piece; the rhythm refills it next day.
//   violations         ->  the blocking set. Non-empty implies publish === false.
//   warnings           ->  review flags (voice only; addressee findings are all in
//                          `addressee`). Never affect publish.
//   addresseeBlocking  ->  the subset of addressee merged into `violations`.
//
// NOTE ON INLINING: the deploy patcher strips `export `/`import` and concatenates
// grounding.js + voice.js + addressee.js + gate.js into ONE scope. Nothing here may
// declare a name that already exists in one of those modules (addressee.js owns
// `blockingViolations`). Hence `isVoiceWarn` / `VOICE_WARN_KINDS`, which are unique.

import { checkGrounding, publishPolicy, deriveTemporalFacts } from './grounding.js';
import { checkVoice, venuesOf, mergeViolations } from './voice.js';
import { checkAddressee, blockingViolations } from './addressee.js';

// Voice findings that are review flags, not defect classes. See revision 4 note.
const VOICE_WARN_KINDS = { 'impersonation': true, 'reader-as-subject': true };
function isVoiceWarn(x) {
  if (!x) return false;
  if (x.severity === 'warn') return true;
  return VOICE_WARN_KINDS[x.kind] === true;
}

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

  // Grounding violations carry no severity: an unsupported record-derived claim is
  // always blocking. Voice findings are split by the mapping above.
  const voiceBlocking = voice.filter(function (x) { return !isVoiceWarn(x); });
  const voiceWarnings = voice.filter(isVoiceWarn);

  const violations = mergeViolations(grounding, voiceBlocking, addresseeBlocking);
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
    warnings: voiceWarnings,
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
