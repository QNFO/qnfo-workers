// personal-api/companion-notify.test.mjs (COMPANION-NOTIFY-ANSWER-1, agent_issues 100198, pillar personal)
// The service worker answers "Did it" / "Not today" itself and opens a check-in on the mood picker. SW_JS is run in a vm with a
// fake ServiceWorkerGlobalScope, so the shipped string is what is tested.
// Run: node personal-api/companion-notify.test.mjs
import vm from "node:vm";
import fs from "node:fs";
import * as C from "./companion.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};

function makeSw(opts) {
  const o = opts || {};
  const handlers = {}, shown = [], opened = [], navigated = [], fetches = [], closed = [];
  const self = {
    addEventListener(t, f) { handlers[t] = f; },
    skipWaiting() {}, clients: {
      claim() {},
      async matchAll() { return (o.windows || []).map((u) => ({ url: u, navigate(x) { navigated.push(x); }, focus() { return Promise.resolve("focused"); } })); },
      async openWindow(u) { opened.push(u); return {}; }
    },
    registration: {
      async showNotification(title, op) { shown.push({ title, op }); },
      async getNotifications(f) { return shown.filter((x) => x.op.tag === f.tag).map((x) => ({ close() { closed.push(x.op.tag); } })); }
    }
  };
  const fetchFn = async (url, init) => {
    fetches.push({ url, init });
    if (o.fetchError) throw new TypeError("network");
    return o.fetchResponse ? o.fetchResponse(url, init) : new Response(JSON.stringify({ ok: true, reply: "Noted, and well done." }), { status: 200 });
  };
  const ctx = vm.createContext({ self, fetch: fetchFn, Response, JSON, Number, Promise, console, setTimeout: (f) => { f(); return 0; } });
  vm.runInContext(C.SW_JS, ctx);
  const click = async (action, data) => {
    let p = null, closedNote = false;
    handlers.notificationclick({ action, notification: { data, close() { closedNote = true; } }, waitUntil(x) { p = x; } });
    await p;
    return closedNote;
  };
  return { handlers, shown, opened, navigated, fetches, closed, click, self };
}

console.log("\n[notification buttons answer without opening the app]");
{
  const sw = makeSw();
  await sw.click("done", { url: "/companion#n=42", id: 42, tag: "cmp-42" });
  const f = sw.fetches[0];
  ok("done: POST to the nudge endpoint", f && f.url === "/companion/api/nudge" && f.init.method === "POST", f);
  ok("done: same-origin credentials carry the sign-in cookie", f.init.credentials === "same-origin");
  ok("done: X-Companion header (cookie writes need it)", f.init.headers["X-Companion"] === "1" && f.init.headers["Content-Type"] === "application/json");
  ok("done: body is the page's own shape {id, state:'done'}", JSON.stringify(JSON.parse(f.init.body)) === JSON.stringify({ id: 42, state: "done" }), f.init.body);
  ok("done: no app window opened or navigated", sw.opened.length === 0 && sw.navigated.length === 0);
  ok("done: a confirmation notification shows the server reply, quietly", sw.shown.length === 1 && sw.shown[0].op.body === "Noted, and well done." && sw.shown[0].op.silent === true, sw.shown);
  ok("done: the confirmation is closed again", sw.closed.length === 1 && sw.closed[0] === "cmp-42");
}
{
  const sw = makeSw({ fetchResponse: () => new Response(JSON.stringify({ ok: true, reply: "That's fine. Not today is a real answer." }), { status: 200 }) });
  await sw.click("no", { url: "/companion#n=7", id: 7, tag: "cmp-7" });
  ok("no: state is 'declined', as the page's #n handler sends", JSON.parse(sw.fetches[0].init.body).state === "declined" && JSON.parse(sw.fetches[0].init.body).id === 7);
  ok("no: confirmation, no window", sw.opened.length === 0 && sw.shown[0].op.body.includes("Not today"));
}
{
  const sw = makeSw({ windows: ["https://me.q08.org/companion"], fetchResponse: () => new Response("{}", { status: 401 }) });
  await sw.click("done", { url: "/companion#n=9", id: 9, tag: "cmp-9" });
  ok("signed out (401): falls back to opening the app on the answer", sw.navigated[0] === "/companion#n=9&a=done" && sw.shown.length === 0, { nav: sw.navigated, shown: sw.shown });
}
{
  const sw = makeSw({ fetchError: true });
  await sw.click("no", { url: "/companion#n=3", id: 3, tag: "cmp-3" });
  ok("offline: falls back to opening the app (no window yet -> openWindow)", sw.opened[0] === "/companion#n=3&a=no", sw.opened);
}
{
  const sw = makeSw();
  await sw.click("", { url: "/companion#n=5", id: 5, tag: "cmp-5" });
  ok("a tap on the body (no action) still just opens the app", sw.fetches.length === 0 && sw.opened[0] === "/companion#n=5");
  const sw2 = makeSw();
  await sw2.click("done", { url: "/companion", id: null });
  ok("an action with no nudge id does not call the API", sw2.fetches.length === 0 && sw2.opened.length === 1);
}

console.log("\n[push payload and actions]");
{
  const sw = makeSw();
  let p = null;
  sw.handlers.push({ data: { json: () => ({ title: "One small thing", body: "x", id: 11, kind: "cmp-next", tag: "cmp-11", url: "/companion#n=11", ask: true }) }, waitUntil(x) { p = x; } });
  await p;
  const n = sw.shown[0];
  ok("ask pushes still get the two buttons", n.op.actions.length === 2 && n.op.actions[0].action === "done" && n.op.actions[1].action === "no");
  ok("the tag rides in the notification data for the confirmation", n.op.data.tag === "cmp-11" && n.op.data.id === 11);
  const row = { id: 3, kind: "cmp-checkin", ask: "How are you, 1 to 5?" };
  const pc = C.pushPayloadFor(row);
  ok("a check-in notification opens on the mood picker", pc.url === "/companion#mood" && pc.ask === false, pc);
  ok("the e-mail ladder's check-in mirrors to the same target", C.pushPayloadFor({ id: 4, kind: "checkin", ask: "x" }).url === "/companion#mood");
  ok("other nudges keep opening on their own answer link", C.pushPayloadFor({ id: 5, kind: "cmp-next", ask: "x" }).url === "/companion#n=5" && C.pushPayloadFor({ id: 6, kind: "cmp-week", ask: "x" }).url === "/companion#week");
}

console.log("\n[the page opens the mood picker]");
{
  const html = C.PAGE_HTML;
  ok("Today's mood card has an anchor", html.includes("id:'mood-card'"));
  ok("the #mood hash goes to Today and scrolls to it", /q\.mood!==undefined\)\{go\('today'\)[^}]*mood-card/.test(html));
  ok("SW_JS has no template-literal hazards (no backtick, no ${})", !C.SW_JS.includes("`") && !C.SW_JS.includes("${"));
}

console.log("\n[worker.js parity]");
{
  const w = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  ok("worker.js carries COMPANION-NOTIFY-ANSWER-1 (the issue's closing probe)", w.includes("COMPANION-NOTIFY-ANSWER-1"));
  ok("worker.js carries the shipped SW_JS", w.includes("function answerFromNotification(d, action)"));
}
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
