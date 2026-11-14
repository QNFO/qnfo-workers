// control-expiry.mjs — pure helpers for the q08 prediction-markets control plane.
//
// pt_control holds JSON maps; two of them are time sensitive:
//   domains_off : { [domain]: untilISO }  a domain is switched off until `until`
//   blend       : { [source]: weight }    weights handed to the blender
//
// Nothing here touches D1, fetch or worker bindings: every function is pure, so the
// worker can call it inside a request and a test can pin it without mocks.
//
// Semantics pinned by this module:
//   * a missing / empty / unparseable `until` counts as EXPIRED (fail closed: an
//     unreadable switch-off must not leave a domain disabled forever);
//   * `until` exactly equal to `now` counts as EXPIRED (boundary is `<=`);
//   * a blend weight that is not a finite number > 0 is IGNORED, never summed;
//   * no function mutates its input.

/** Coerce `now` (number ms, Date, or ISO string) to epoch ms. Falls back to Date.now(). */
export function toMs(now) {
  if (now instanceof Date) {
    const t = now.getTime();
    return Number.isFinite(t) ? t : Date.now();
  }
  if (typeof now === 'number') return Number.isFinite(now) ? now : Date.now();
  const t = Date.parse(String(now));
  return Number.isFinite(t) ? t : Date.now();
}

/** Parse an `until` value to epoch ms, or null when absent/unparseable. */
export function parseUntil(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  const s = String(value).trim();
  if (s === '') return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** True when `until` has passed relative to `now`. Unparseable `until` => expired. */
export function isExpired(until, now) {
  const ms = parseUntil(until);
  if (ms == null) return true;
  return ms <= toMs(now);
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Split a { key: until } map into the entries still in force and the ones that expired.
 * @returns {{ next: Record<string, unknown>, dropped: string[], kept: string[] }}
 */
export function pruneExpired(map, now) {
  const next = {};
  const dropped = [];
  const kept = [];
  if (!isPlainObject(map)) return { next, dropped, kept };
  for (const key of Object.keys(map)) {
    if (isExpired(map[key], now)) dropped.push(key);
    else {
      next[key] = map[key];
      kept.push(key);
    }
  }
  return { next, dropped, kept };
}

/** Keys of a { key: until } map that are still switched off at `now`. */
export function activeDomains(map, now) {
  return pruneExpired(map, now).kept;
}

/** Sum of usable blend weights: finite numbers strictly greater than 0 only. */
export function blendTotal(blend) {
  if (!isPlainObject(blend)) return 0;
  let total = 0;
  for (const key of Object.keys(blend)) {
    const w = blend[key];
    if (typeof w === 'number' && Number.isFinite(w) && w > 0) total += w;
  }
  return total;
}

/** Weights scaled to sum 1, dropping unusable entries. Empty object when nothing is usable. */
export function normalizeBlend(blend) {
  const total = blendTotal(blend);
  if (total <= 0) return {};
  const out = {};
  for (const key of Object.keys(blend)) {
    const w = blend[key];
    if (typeof w === 'number' && Number.isFinite(w) && w > 0) out[key] = w / total;
  }
  return out;
}

/**
 * Deterministic read-only view of the control state at `now`.
 * @returns {{ off: string[], active: string[], blend: Record<string, number>, blendTotal: number }}
 */
export function controlView(ctl, now) {
  const domainsOff = isPlainObject(ctl) ? ctl.domains_off : null;
  const blend = isPlainObject(ctl) ? ctl.blend : null;
  const pruned = pruneExpired(domainsOff, now);
  return {
    off: pruned.kept,
    active: pruned.dropped,
    blend: normalizeBlend(blend),
    blendTotal: blendTotal(blend),
  };
}
