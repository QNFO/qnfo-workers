import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import worker from "./worker.js";

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE published_pieces (id TEXT, slug TEXT, title TEXT, body_md TEXT, core_concept TEXT,
    published_at TEXT, reads INTEGER DEFAULT 0, sources_json TEXT, feedback_score REAL, kind TEXT);
  CREATE TABLE q08_feedback (id INTEGER PRIMARY KEY, slug TEXT, signal TEXT, ip_key TEXT, note TEXT, created_at TEXT);
  CREATE TABLE q08_daily_reads (day TEXT PRIMARY KEY, human INTEGER DEFAULT 0, crawler INTEGER DEFAULT 0);
  CREATE TABLE q08_retractions (slug TEXT);
  INSERT INTO published_pieces (id, slug, title, body_md, published_at)
    VALUES ('p1', 'piece-one', 'A piece', 'Article body', '2026-11-01T00:00:00Z');
`);
const env = { DB: { prepare(sql) {
  let args = [];
  const statement = {
    bind(...values) { args = values; return statement; },
    async run() { return db.prepare(sql).run(...args); },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; }
  };
  return statement;
} } };
const ctx = { waitUntil() {} };
const headers = { "user-agent": "Mozilla/5.0", "cf-connecting-ip": "192.0.2.1" };
const page = await (await worker.fetch(new Request("https://q08.org/p/piece-one", { headers }), env, ctx)).text();
const formHtml = page.match(/<form class="q08-fb"[\s\S]*?<\/form>/)?.[0];
assert.ok(formHtml);
assert.match(formHtml, /method="post"/, "native form submission remains available");
assert.match(formHtml, /role="status"/, "confirmation is announced to assistive technology");
const script = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1]).find((source) => source.includes('".q08-fb"'));
assert.ok(script, "the article enhances its voting form");

function browser(fetch) {
  const buttons = [...formHtml.matchAll(/formaction="([^"]+)"/g)]
    .map((match) => ({ formAction: "https://q08.org" + match[1].replace(/&amp;/g, "&"), disabled: false }));
  const status = { textContent: "" };
  let submit;
  const form = {
    querySelectorAll() { return buttons; },
    querySelector() { return status; },
    addEventListener(event, handler) { assert.equal(event, "submit"); submit = handler; }
  };
  runInNewContext(script, {
    document: { querySelector() { return form; } },
    fetch, FormData: class { constructor(target) { assert.equal(target, form); return new URLSearchParams({ note: "Useful <b>detail</b>" }); } }
  });
  return { buttons, status, submit };
}
async function click(ui, index = 0) {
  let prevented = false;
  await ui.submit({ submitter: ui.buttons[index], preventDefault() { prevented = true; } });
  assert.ok(prevented, "enhanced votes do not navigate away from the article");
}
const ui = browser(async (url, options) => {
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Accept, "application/json");
  assert.ok(ui.buttons.every((button) => button.disabled), "all votes are disabled while saving");
  return worker.fetch(new Request(url, { ...options, headers: { ...headers, ...options.headers } }), env, ctx);
});
await click(ui);
assert.match(ui.status.textContent, /thank|recorded/i);
assert.ok(ui.buttons.every((button) => button.disabled), "successful votes cannot be submitted again");
assert.deepEqual(db.prepare("SELECT slug, signal, note FROM q08_feedback").get(),
  Object.assign(Object.create(null), { slug: "piece-one", signal: "good", note: "Useful b detail /b" }));
const duplicate = browser((url, options) => worker.fetch(
  new Request(url, { ...options, headers: { ...headers, ...options.headers } }), env, ctx));
await click(duplicate, 2);
assert.match(duplicate.status.textContent, /already recorded/i);
assert.equal(db.prepare("SELECT COUNT(*) n FROM q08_feedback").get().n, 1);

for (const failure of [
  () => Promise.reject(new Error("offline")),
  () => Promise.resolve(new Response(JSON.stringify({ ok: false, error: "<b>rate limited</b>" }), { status: 429 })),
  () => Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 200 })),
  () => Promise.resolve(new Response("not JSON", { status: 502 }))
]) {
  const retry = browser(failure);
  await click(retry, 1);
  assert.match(retry.status.textContent, /try again/i);
  assert.ok(retry.buttons.every((button) => !button.disabled), "failure leaves votes retryable");
}
let attempts = 0;
const recovered = browser((url, options) => {
  if (++attempts === 1) return Promise.reject(new Error("offline"));
  return worker.fetch(new Request(url, {
    ...options, headers: { ...headers, ...options.headers, "cf-connecting-ip": "192.0.2.3" }
  }), env, ctx);
});
await click(recovered, 1);
await click(recovered, 1);
assert.match(recovered.status.textContent, /thanks/i);
assert.equal(db.prepare("SELECT signal FROM q08_feedback ORDER BY id DESC LIMIT 1").get().signal, "flat",
  "a reader can retry their original vote after a failed request");
const negative = browser((url, options) => worker.fetch(new Request(url, {
  ...options, headers: { ...headers, ...options.headers, "cf-connecting-ip": "192.0.2.4" }
}), env, ctx));
await click(negative, 2);
assert.equal(db.prepare("SELECT signal FROM q08_feedback ORDER BY id DESC LIMIT 1").get().signal, "no",
  "all three verdict choices retain their meaning");
assert.equal(browser(undefined).submit, undefined, "without fetch the native form is not intercepted");
const keyboard = browser(() => { throw new Error("must not fetch without a submitter"); });
await keyboard.submit({ submitter: null, preventDefault() { throw new Error("native fallback must remain available"); } });

const bot = await worker.fetch(new Request("https://q08.org/api/f?slug=piece-one&s=good",
  { method: "POST", headers: { "user-agent": "crawler", "cf-connecting-ip": "192.0.2.2" } }), env, ctx);
assert.equal(bot.status, 403, "bot validation remains enforced");
assert.equal(db.prepare("SELECT COUNT(*) n FROM q08_feedback").get().n, 3);
console.log("feedback.test.mjs ok");
