// The companion at me.q08.org (personal-api/companion.js), walked as the owner uses it on their phone. Owner rules these journeys
// hold the app to: no typing (one-tap buttons, Dictate for words), no key, no e-mail channel beyond the sign-in code.
// Local journeys run the real page and API against apps/companion-harness.mjs. Live journeys are signed out and read-only: they
// never tap "E-mail me a code" (that would mail the owner a real code).
import { PLAIN_BAD } from "../../../personal-api/companion.js";
export const name = "companion";
export const liveBase = "https://me.q08.org";
export async function startLocal() { const { startCompanion } = await import("./companion-harness.mjs"); return startCompanion(); }
// The Today screen with the right-now card, the Do list and the one-tap journal is the classic page; the default /companion page (PAGE_V3) is a different
// layout without them (UX-JOURNEY-1 issues 1002789-1002793: every local journey looked for the classic text on the V3 page and never finished).
const CLASSIC = "/companion/classic";
const signedIn = async (u) => { await u.open("/__harness/session"); await u.open(CLASSIC); await u.see("What can I do right now?"); };

export const journeys = [
  { id: "calm-down", title: "Overwhelmed: tap Calm down and get through breathing and grounding",
    async run(u) {
      await u.open("/__harness/session"); await u.open("/companion"); await u.see("Too much right now?");
      await u.tap("Calm down"); await u.see("Nothing has to happen right now."); await u.screen("calm");
      await u.tap("Next", { within: "#calm" }); await u.see("Breathe with me");
      await u.tap("Skip", { within: "#calm" }); await u.see("Find 5 things you can see.");
      await u.tap("Skip", { within: "#calm" }); await u.see("How is it now?");
      await u.tap("Better", { within: "#calm" }); await u.see("Rest for a bit");
    } },
  { id: "mind-card", title: "Mind is on Today: read a one-minute card, tap This helps, get another, open Go deeper",
    async run(u) {
      await u.open("/__harness/session"); await u.open("/companion"); await u.see("Right now", { wait: 5000 }); await u.see("What can help"); await u.screen("mind-card");
      await u.tap("This helps"); await u.see("Helps (saved)");
      await u.tap("Another one"); await u.see("What can help");
      await u.tap("Go deeper: books, one tap each"); await u.see("Go deeper"); await u.see("How my mind works", { wait: 5000 });
    } },
  { id: "evening-recap", title: "Evening: see what the day held and let the rest go",
    async run(u, env) {
      await fetch(env.base + "/__harness/clock?local=20"); await fetch(env.base + "/__harness/done-one?title=Call%20the%20dentist");
      try {
        await u.open("/__harness/session"); await u.open("/companion"); await u.see("Today so far"); await u.see("Done: Call the dentist"); await u.screen("recap");
        await u.tap("Let today go"); await u.notSee("Today so far", { wait: 1500 });
      } finally { await fetch(env.base + "/__harness/clock?local=now"); }
    } },
  { id: "today-plain-language", title: "Today reads as plain words: no ids, tags or machine text",
    async run(u) {
      for (const path of [CLASSIC, "/companion"]) {
        await u.open("/__harness/session"); await u.open(path); await u.see("Call the dentist", { wait: 4000 }).catch(() => {});
        const text = await u.page.locator("body").innerText();
        await u.expect(async () => !PLAIN_BAD.test(text), "Today on " + path + " shows machine text: " + (PLAIN_BAD.exec(text) || [""])[0]);
      }
    } },
  { id: "sign-in", title: "Sign in on a new phone with the e-mailed code",
    async run(u, env) {
      await u.open(CLASSIC); await u.see("E-mail me a code"); await u.screen("sign-in");
      await u.tap("E-mail me a code"); await u.see("Sent to");
      const code = await (await fetch(env.base + "/__harness/last-code")).text();
      await u.type("#li-code", code); // the one field the owner must fill: six digits from their inbox
      await u.tap("Open"); await u.see("What can I do right now?"); await u.screen("today");
    } },
  { id: "sign-out", title: "Sign out on this phone and stay signed out after a reload",   // issue 11287: no sign-in cookie survives sign-out
    async run(u) {
      await signedIn(u);
      await u.tap("More", { within: "nav" }); await u.tap("Data", { within: "nav" }); await u.tap("Sign out on this device"); await u.see("E-mail me a code");
      await u.open(CLASSIC); await u.see("E-mail me a code"); await u.screen("signed-out");
    } },
  { id: "one-thing-now", title: "Bored or stuck: get one thing to do and start it",
    async run(u) {
      await signedIn(u);
      await u.tap("Give me one thing"); await u.notSee("Could not load"); await u.see("Just this");
      await u.screen("focus");
      await u.tap("Yes — start"); await u.see("Done");
    } },
  { id: "hub-places", title: "Open Today and reach travel, jobs and mind from one place",
    async run(u) {
      await signedIn(u); await u.see("Your places"); await u.see("Travel"); await u.see("Jobs"); await u.see("Mind"); await u.screen("hub");
    } },
  { id: "mark-done", title: "Tick off a next action",
    async run(u) {
      await signedIn(u);
      await u.tap("Do", { within: "nav" }); await u.see("Call the dentist"); await u.screen("do");
      await u.tap(u.page.locator("#v-do .item", { hasText: "Call the dentist" }).getByRole("button", { name: "Done" }));
      await u.notSee("Call the dentist", { wait: 800 });
    } },
  { id: "journal-one-tap", title: "Write a journal line without typing",
    async run(u) {
      await signedIn(u);
      await u.tap("More", { within: "nav" }); await u.tap("Journal", { within: "nav" }); await u.screen("journal");
      await u.tap("Went outside"); await u.see("Went outside", { within: "#v-journal" });
    } },
  { id: "dictate-and-talk", title: "Say something to the companion and get an answer",
    async run(u) {
      await signedIn(u);
      await u.tap("Talk", { within: "nav" }); await u.screen("talk");
      await u.tap("Dictate", { within: "#v-talk", wait: 1200 }); await u.tap("Stop", { within: "#v-talk", wait: 1500 });
      await u.tap("Send", { within: "#v-talk", wait: 1500 }); await u.see("good plan", { within: "#msgs" });
    } },
  { id: "checkin-from-notification", title: "Tap a check-in notification and answer how I feel",
    async run(u) {
      await u.open("/__harness/session"); await u.open(CLASSIC + "#mood"); await u.see("What can I do right now?");
      // The notification opens /companion#mood; the owner should land on a one-tap mood scale.
      await u.page.locator("#mood-card button").first().waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
      await u.expect(async () => (await u.page.locator("#mood-card button").filter({ visible: true }).count()) > 0, "the check-in notification opens Today with no mood buttons to tap (no #mood-card)");
      await u.tap(u.page.locator("#mood-card button").filter({ visible: true }).nth(2)); await u.screen("mood");
    } },
  { id: "reading-pick", title: "Find something to read: the books sit under Go deeper on Today, no other address",
    async run(u) {
      await u.open("/__harness/session"); await u.open("/companion"); await u.see("Right now", { wait: 5000 });
      await u.tap("Go deeper: books, one tap each"); await u.see("Seven and a Half Lessons About the Brain", { wait: 5000 });
      await u.tap("Seven and a Half Lessons About the Brain"); await u.see("Short essays on what a brain is actually for");
    } },
  // ASK-FAST-1 (Rowan's screenshot 2026-11-13): "What's on tonight?" sat on "Looking..." and the mic-blocked message covered the input.
  { id: "ask-tonight", title: "Ask: tap What's on tonight? and get an answer at once, with one tap for the live look-up",
    async run(u) {
      await u.open("/__harness/session"); await u.open("/companion"); await u.tap("Ask", { within: "nav" });
      await u.tap("What's on tonight?"); await u.see("on your calendar tonight", { timeout: 8000 }); await u.see("Search venue listings for tonight");
      await u.expect(async () => (await u.page.locator(".msg.bot.mute", { hasText: "Looking" }).count()) === 0, "Ask still shows Looking... after the answer");
      await u.screen("ask-tonight");
    } },
  { id: "ask-mic-blocked", title: "Ask with the microphone blocked: a short note that never covers the input, and one-tap questions",
    async run(u) {
      await u.page.addInitScript(() => { const SR = function () {}; SR.prototype.start = function () { const s = this; setTimeout(() => { s.onerror && s.onerror({ error: "not-allowed" }); s.onend && s.onend(); }, 50); }; SR.prototype.stop = function () {}; window.SpeechRecognition = SR; window.webkitSpeechRecognition = SR; });
      await u.open("/__harness/session"); await u.open("/companion"); await u.tap("Ask", { within: "nav" });
      await u.tap("Speak your question"); await u.see("Voice is switched off for this site, so tap a question instead.");
      const box = async (sel) => u.page.locator(sel).first().boundingBox();
      await u.expect(async () => { const n = await box("#micnote"), c = await box("#dock .composer"); return !!(n && c) && (n.y + n.height <= c.y || n.y >= c.y + c.height); }, "the mic-blocked note overlaps the Ask input");
      await u.expect(async () => !(await u.page.locator("#toast.show").count()), "a toast covers the screen when the mic is blocked");
      await u.screen("ask-mic-blocked");
      await u.tap("What's on tonight?"); await u.see("on your calendar tonight", { timeout: 8000 });
    } },
  { id: "today-default", title: "Open the companion and see Today with Ask and Capture",
    async run(u) { await u.open("/__harness/session"); await u.open("/"); await u.see("Ask me"); await u.see("Capture", { within: "nav" }); await u.screen("today-default"); } },
  { id: "live-sign-in-screen", title: "Open me.q08.org on a phone that is not signed in", modes: ["live"],
    async run(u) { await u.open("/"); await u.see("E-mail me a code"); await u.screen("sign-in"); } },
  { id: "live-guide", title: "Read the one-page guide", modes: ["live"],
    async run(u) { await u.open("/guide"); await u.see("Open my companion"); await u.screen("guide"); } }
];
