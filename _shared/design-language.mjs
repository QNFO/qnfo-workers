// DESIGN-LANGUAGE-1 (owner directive 2026-11-14): products vary inside the portfolio; the portfolio's look is fixed by DESIGN-SYSTEM-1.
// Derives a product's accent tokens (light and dark) from one seed colour, moving lightness only until every accent pair of
// DS_CONTRAST_PAIRS passes, and emits the CSS override a page passes to dsHead(title, description, extraCss).
// Run: node _shared/design-language.mjs [--write]   (--write refreshes the css strings in design-language.json)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { moduleSource } from "./inline-design-system.mjs";

const names = [...moduleSource().matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
export const DS = new Function(moduleSource() + "\nreturn {" + names.join(",") + "};")();

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const rgb2hex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
export function toHsl(h) {
  const [r, g, b] = hex2rgb(h), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hh * 60 + 360) % 360, s, l];
}
export function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgb2hex([r + m, g + m, b + m]);
}
export const hueDistance = (a, b) => { const d = Math.abs(toHsl(a)[0] - toHsl(b)[0]) % 360; return Math.min(d, 360 - d); };

const ACCENT_KEYS = ["accent", "accentHover", "onAccent", "accentSoft", "accentSoftInk", "focus"];

export function deriveAccent(seed) {
  const [h, s] = toHsl(seed), out = {};
  for (const mode of ["light", "dark"]) {
    const base = DS.DS_TOKENS[mode], t = {};
    if (mode === "light") {
      t.onAccent = "#ffffff";
      let l = 0.62; t.accent = fromHsl(h, s, l);
      while (l > 0.05 && !(DS.dsContrast(t.accent, base.surface) >= 4.5 && DS.dsContrast(t.accent, base.bg) >= 4.5 && DS.dsContrast(t.onAccent, t.accent) >= 4.5)) { l -= 0.01; t.accent = fromHsl(h, s, l); }
      t.accentHover = fromHsl(h, s, Math.max(0.03, l - 0.06));
      t.accentSoft = fromHsl(h, Math.min(s, 0.9), 0.92); t.accentSoftInk = fromHsl(h, s * 0.8, 0.22);
    } else {
      t.onAccent = base.onAccent;
      let l = 0.45; t.accent = fromHsl(h, s, l);
      while (l < 0.95 && !(DS.dsContrast(t.accent, base.surface) >= 4.5 && DS.dsContrast(t.accent, base.bg) >= 4.5 && DS.dsContrast(t.onAccent, t.accent) >= 4.5)) { l += 0.01; t.accent = fromHsl(h, s, l); }
      t.accentHover = fromHsl(h, s, Math.min(0.97, l + 0.03));
      t.accentSoft = fromHsl(h, s * 0.5, 0.18); t.accentSoftInk = fromHsl(h, s * 0.6, 0.86);
    }
    t.focus = t.accent; out[mode] = t;
  }
  return out;
}

// Every pair of DS_CONTRAST_PAIRS, with the product's accent tokens over the portfolio tokens. Returns the failures.
export function prove(accent) {
  const bad = [];
  for (const mode of ["light", "dark"]) {
    const t = Object.assign({}, DS.DS_TOKENS[mode], accent[mode]);
    for (const [fg, bg, min] of DS.DS_CONTRAST_PAIRS) { const r = DS.dsContrast(t[fg], t[bg]); if (r + 1e-9 < min) bad.push(mode + ": " + fg + " on " + bg + " is " + r.toFixed(2) + ", needs " + min); }
  }
  return bad;
}

const VAR = { accent: "accent", accentHover: "accent-hover", onAccent: "on-accent", accentSoft: "accent-soft", accentSoftInk: "accent-soft-ink", focus: "focus" };
export function css(seed) {
  const a = deriveAccent(seed), block = (t) => ACCENT_KEYS.map((k) => "--ds-" + VAR[k] + ":" + t[k]).join(";");
  return ":root{" + block(a.light) + "}@media (prefers-color-scheme:dark){:root{" + block(a.dark) + "}}";
}

const file = new URL("design-language.json", import.meta.url);
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--write")) {
  const j = JSON.parse(readFileSync(file, "utf8"));
  j.css = {}; for (const [k, p] of Object.entries(j.products)) j.css[k] = css(p.accent_seed);
  writeFileSync(file, JSON.stringify(j, null, 2) + "\n"); console.log("design-language.json css refreshed");
}
