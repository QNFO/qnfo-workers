// ART50-CHANNEL-DRAIN-MARKER-1 (qnfo-social 0.21.1): the channel drain marks its text, and the stored 200-character preview keeps the marker.
// Run: node qnfo-social/channel-marker.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
let pass = 0; const ok = (n) => { pass++; console.log('ok - ' + n); };
assert.ok(/const text = withAutomationMarker\(utmTagText\(channelText\(channel, cg\.texts, link, row\.title\)/.test(src)); ok('the drain text passes through withAutomationMarker before channelCreate');
assert.ok(/CHANNEL_MAX_CHARS\[channel\] \|\| 280\);\s*\n\s*const res = await channelCreate\(env, ch, channel, text, liMode\);/.test(src)); ok('the limit is the channel limit');
const m = src.match(/function previewKeepingMarker\(text\) \{[\s\S]*?\n\}/);
assert.ok(m); const AUTOMATION_MARKER = ' [AI-generated]';
const previewKeepingMarker = new Function('AUTOMATION_MARKER', m[0] + '; return previewKeepingMarker;')(AUTOMATION_MARKER);
const long = 'x'.repeat(400) + AUTOMATION_MARKER;
assert.equal(previewKeepingMarker(long).length, 200); assert.ok(previewKeepingMarker(long).endsWith(AUTOMATION_MARKER)); ok('a long marked post keeps the marker in a 200-character preview');
assert.equal(previewKeepingMarker('y'.repeat(400)), 'y'.repeat(200)); ok('an unmarked long post is cut as before');
assert.equal(previewKeepingMarker('short' + AUTOMATION_MARKER), 'short' + AUTOMATION_MARKER); ok('a short post is stored whole');
assert.ok(/recordChannelPost[\s\S]{0,900}previewKeepingMarker\(text\)/.test(src)); ok('recordChannelPost stores the marker-keeping preview');
console.log(pass + ' passed, 0 failed');
