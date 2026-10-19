// SOCIAL-PAUSE-STALE-UNTIL-1 (agent_issues 2818): the social_paused gate. Drives drainRollup, drainChannels and drainQueue against a
// mock D1 whose pipeline_flags rows carry updated_at, and asserts that a pause is never read as expired because of a stale
// social_paused_until, that a failed expiry clear keeps the pause, and that every read logs one pause-read line.
// Run: node qnfo-social/pause-stale-until.test.mjs
import assert from 'node:assert/strict';
const mod = await import('./worker.js');
let pass = 0;
function ok(name) { pass++; console.log('ok - ' + name); }

const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const sqlTs = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

function mkEnv(flags, opts) {
  opts = opts || {};
  const writes = [];
  const rowsFor = () => Object.keys(flags).map((k) => ({ key: k, value: flags[k].value, updated_at: flags[k].updated_at }));
  const stmt = (sql) => {
    const o = {
      bind() { return o; },
      async run() {
        writes.push(sql);
        if (opts.clearThrows && /UPDATE pipeline_flags SET value='0'/.test(sql)) throw new Error('D1 write failed');
        if (/UPDATE pipeline_flags SET value='0'/.test(sql) && flags.social_paused) flags.social_paused.value = '0';
        if (/DELETE FROM pipeline_flags WHERE key='social_paused_until'/.test(sql)) delete flags.social_paused_until;
        return { success: true };
      },
      async first() { return null; },
      async all() {
        if (opts.readThrows && sql.includes("key IN ('social_paused','social_paused_until')")) throw new Error('D1 read failed');
        return { results: sql.includes("key IN ('social_paused','social_paused_until')") ? rowsFor() : [] };
      },
    };
    return o;
  };
  return { writes, env: { DB: { prepare: stmt, async batch() { return []; } }, BUFFER_TOKEN: 'buf', BSKY_HANDLE: 'h', BSKY_APP_PASS: 'p', SOCIAL_TOKEN: 't', AI: {} } };
}
function capture(fn) {
  const lines = [];
  const log = console.log, err = console.error;
  console.log = (...a) => { lines.push(a.join(' ')); };
  console.error = (...a) => { lines.push(a.join(' ')); };
  return fn().finally(() => { console.log = log; console.error = err; }).then((r) => ({ r, lines }));
}
const posts = [];
globalThis.fetch = async (url, init) => { posts.push(String(url)); return new Response('{}', { status: 200 }); };
const readLine = (lines) => lines.map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter((j) => j && j.event === 'pause-read')[0];

// 1. a fresh pause with a future until, written together: paused, nothing fetched
{
  const t = iso(NOW - 3600e3);
  const { env } = mkEnv({ social_paused: { value: '1', updated_at: t }, social_paused_until: { value: iso(NOW + 23 * 3600e3), updated_at: t } });
  const { r, lines } = await capture(() => mod.drainRollup(env, {}));
  assert.equal(r.skipped, 'paused');
  const pl = readLine(lines);
  assert.equal(pl.note, 'paused'); assert.equal(pl.value, '1'); assert.ok(pl.until && pl.pause_at && pl.until_at);
  ok('pause with a future until written together holds, and the read is logged with value, until and write times');
}
// 2. THE DEFECT: a stale until from an earlier episode (older than the pause row, in the past) must not end the pause
{
  const { env, writes } = mkEnv({ social_paused: { value: '1', updated_at: iso(NOW - 5 * 3600e3) }, social_paused_until: { value: iso(NOW - 2 * 3600e3), updated_at: iso(NOW - 40 * 3600e3) } });
  const { r, lines } = await capture(() => mod.drainRollup(env, {}));
  assert.equal(r.skipped, 'paused');
  assert.equal(readLine(lines).note, 'stale-until-ignored');
  assert.ok(!writes.some((w) => /UPDATE pipeline_flags SET value='0'/.test(w)), 'a stale until never clears the pause');
  ok('a stale until from an earlier episode is ignored: the pause holds and is not cleared');
}
// 3. legitimate expiry: until written with the pause and now in the past: cleared, drain proceeds past the gate
{
  const t = iso(NOW - 26 * 3600e3);
  const flags = { social_paused: { value: '1', updated_at: t }, social_paused_until: { value: iso(NOW - 2 * 3600e3), updated_at: t } };
  const { env, writes } = mkEnv(flags);
  const { r, lines } = await capture(() => mod.drainRollup(env, {}));
  assert.notEqual(r.skipped, 'paused');
  assert.equal(readLine(lines).note, 'expired-cleared');
  assert.ok(writes.some((w) => /UPDATE pipeline_flags SET value='0'/.test(w)) && flags.social_paused.value === '0');
  ok('an until written with the pause and now past clears it (SOCIAL-PAUSE-RESUME-1 still works)');
}
// 4. the clear fails: the flag still reads 1, so the pause holds
{
  const t = iso(NOW - 26 * 3600e3);
  const { env } = mkEnv({ social_paused: { value: '1', updated_at: t }, social_paused_until: { value: iso(NOW - 2 * 3600e3), updated_at: t } }, { clearThrows: true });
  const { r, lines } = await capture(() => mod.drainRollup(env, {}));
  assert.equal(r.skipped, 'paused');
  assert.equal(readLine(lines).note, 'expired-clear-failed');
  ok('an expired until whose clear fails keeps the pause (fail closed)');
}
// 5. no until: paused indefinitely; not paused: proceeds
{
  const { env } = mkEnv({ social_paused: { value: '1', updated_at: iso(NOW - 3 * 864e5) } });
  const { r } = await capture(() => mod.drainRollup(env, {}));
  assert.equal(r.skipped, 'paused'); ok('pause without an until holds');
  const { env: e2 } = mkEnv({ social_paused: { value: '0', updated_at: iso(NOW) } });
  const { r: r2, lines } = await capture(() => mod.drainRollup(e2, {}));
  assert.notEqual(r2.skipped, 'paused'); assert.equal(readLine(lines).note, 'not-paused'); ok('social_paused=0 is not paused (control: the gate can pass)');
}
// 6. SQLite datetime('now') stamps (space, no zone) compare correctly with ISO stamps
{
  const { env } = mkEnv({ social_paused: { value: '1', updated_at: sqlTs(NOW - 3600e3) }, social_paused_until: { value: iso(NOW - 60e3), updated_at: iso(NOW - 48 * 3600e3) } });
  const { r, lines } = await capture(() => mod.drainRollup(env, {}));
  assert.equal(r.skipped, 'paused'); assert.equal(readLine(lines).note, 'stale-until-ignored');
  ok('a datetime("now") pause stamp is compared as UTC against an ISO until stamp');
}
// 7. all three drains fail closed when the pause read throws, and none fetches
{
  posts.length = 0;
  const { env } = mkEnv({}, { readThrows: true });
  const a = await capture(() => mod.drainRollup(env, {}));
  const b = await capture(() => mod.drainChannels(env, {}));
  const c = await capture(() => mod.drainQueue(env));
  assert.ok(String(a.r.skipped).match(/gate-error|paused/), 'rollup: ' + JSON.stringify(a.r));
  assert.ok(String(b.r.skipped).match(/gate-error|paused/), 'channels: ' + JSON.stringify(b.r));
  assert.ok(c.r && !c.r.posted, 'queue posts nothing: ' + JSON.stringify(c.r));
  assert.equal(posts.filter((u) => /createRecord|api\.buffer\.com|mastodon/.test(u)).length, 0, 'no posting request was made');
  ok('rollup, channels and queue drains post nothing when the pause read throws');
}
console.log('\n' + pass + ' passed');
