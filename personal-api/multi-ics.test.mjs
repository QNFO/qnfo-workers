// personal-api/multi-ics.test.mjs (MULTI-ICS-1, pillar personal): several iCal feeds, one merged list.
// Run: node personal-api/multi-ics.test.mjs
import fs from "node:fs";
import vm from "node:vm";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const grab = (name) => { const i = src.indexOf("function " + name + "("); if (i < 0) throw new Error("missing " + name); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1); } };
const ctx = {}; vm.createContext(ctx);
vm.runInContext(grab("icsFeeds") + "\n" + grab("gIcsConfigured"), ctx);
let bad = 0;
const ok = (n, c, x) => { if (!c) { bad++; console.log("FAIL", n, x === undefined ? "" : JSON.stringify(x)); } else console.log("ok  ", n); };
const f = (env) => JSON.parse(JSON.stringify(ctx.icsFeeds(env)));
ok("nothing configured is not configured", !ctx.gIcsConfigured({}) && f({}).length === 0);
ok("GOOGLE_ICS_URL alone is one feed labelled Google", JSON.stringify(f({ GOOGLE_ICS_URL: "https://calendar.google.com/x.ics" })) === JSON.stringify([{ label: "Google", url: "https://calendar.google.com/x.ics" }]));
const multi = f({ GOOGLE_ICS_URL: "https://g/a.ics", ICS_FEEDS: "Outlook|https://outlook.live.com/o.ics\n# a comment\nhttps://club.example/c.ics\r\nQniverse|https://g/a.ics\nbad|http://insecure/x.ics\n" });
ok("labelled, unlabelled, comment, duplicate and non-https lines are handled", multi.length === 3 && multi[1].label === "Outlook" && multi[2].label === "Calendar 3" && !multi.some((x) => x.url.startsWith("http://")), multi);
ok("at most six feeds", f({ ICS_FEEDS: Array.from({ length: 9 }, (_, i) => "https://h/" + i + ".ics").join("\n") }).length === 6);
ok("configured when any feed exists", ctx.gIcsConfigured({ ICS_FEEDS: "https://h/1.ics" }));
if (bad) process.exit(1);
console.log("all passed");
