// personal-watch: watch.q08.org, a hand-picked, algorithm-free video queue for the owner (personal plane).
// WATCH-1 (2026-10-29, pillar personal): owner asked for curated entertainment instead of YouTube's feed. Sources are fixed lists
// the owner can read here (YouTube channel RSS, Vimeo Staff Picks RSS, Internet Archive collections); no recommender, no tracking.
// "Not this channel" lives in the browser (localStorage); the worker keeps no per-user state.
var VERSION = "1.0.0";

var YT = [
  // [channel id, name, mood]. Moods: wonder (science/ideas), craft (making/engineering), weird (odd/dark/old), funny, calm.
  ["UCsXVk37bltHxD1rDPwtNM8Q", "Kurzgesagt", "wonder"], ["UCHnyfMqiRRG1u-2MsSQLbXA", "Veritasium", "wonder"],
  ["UC6nSFpj9HTCZ5t-N3Rm3-HA", "Vsauce", "wonder"], ["UC2C_jShtL725hvbm1arSV9w", "CGP Grey", "wonder"],
  ["UCoxcjq-8xIDTYp3uz647V5A", "Numberphile", "wonder"], ["UCYO_jab_esuFRV4b17AJtAw", "3Blue1Brown", "wonder"],
  ["UC9RM-iSvTu1uPJb8X5yp3EQ", "Wendover Productions", "wonder"], ["UCBa659QWEk1AI4Tg--mrJ2A", "Tom Scott", "wonder"],
  ["UCR1IuLEqb6UEA_zQ81kwXfg", "Real Engineering", "wonder"], ["UCJkMlOu7faDgqh4PfzbpLdg", "Nerdwriter1", "calm"],
  ["UCY1kMZp36IQSyNx_9h4mpCg", "Mark Rober", "craft"], ["UCj1VqrHhDte54oLgPG4xpuQ", "Stuff Made Here", "craft"],
  ["UCMOqf8ab-42UUQIdVoKwjlQ", "Practical Engineering", "craft"], ["UCy0tKL1T7wFoYcxCe0xjN6Q", "Technology Connections", "craft"],
  ["UCFhXFikryT4aFcLkLw2LBLA", "NileRed", "craft"], ["UCAL3JXZSzSm8AlZyD3nQdBA", "Primitive Technology", "calm"],
  ["UCEOXxzW2vU0P-0THehuIIeg", "Captain Disillusion", "funny"], ["UCSpFnDQr88xCZ80N-X7t0nQ", "Corridor Crew", "funny"],
  ["UCnkp4xDOwqqJD7sSM3xdUiQ", "Adam Neely", "funny"], ["UCRcgy6GzDeccI7dkbbBna3Q", "LEMMiNO", "weird"]
];
var ARCHIVE = [["prelinger", "Prelinger Archives", "weird"], ["classic_cartoons", "Classic Cartoons", "funny"], ["computerchronicles", "Computer Chronicles", "calm"], ["feature_films", "Public-domain feature films", "calm"]];
var MOODS = ["wonder", "craft", "weird", "funny", "calm"];

function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function dec(s) { return String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&"); }
async function get(url) {
  var c = new AbortController(); var t = setTimeout(function () { c.abort(); }, 6000);
  try {
    var r = await fetch(url, { signal: c.signal, headers: { "User-Agent": "personal-watch/" + VERSION }, cf: { cacheTtl: 1800, cacheEverything: true } });
    return r.ok ? await r.text() : "";
  } catch (e) { return ""; } finally { clearTimeout(t); }
}

async function fromYouTube(ch) {
  var xml = await get("https://www.youtube.com/feeds/videos.xml?channel_id=" + ch[0]); var out = [];
  var re = /<entry>[\s\S]*?<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]*)<\/title>/g, m;
  while ((m = re.exec(xml)) && out.length < 12) out.push({ src: "youtube", id: m[1], title: dec(m[2]), by: ch[1], mood: ch[2], url: "https://www.youtube.com/watch?v=" + m[1] });
  return shuffle(out).slice(0, 3);
}
async function fromVimeo() {
  var xml = await get("https://vimeo.com/channels/staffpicks/videos/rss"); var out = [];
  var re = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>https:\/\/vimeo\.com\/(?:channels\/staffpicks\/)?(\d+)/g, m;
  while ((m = re.exec(xml)) && out.length < 20) out.push({ src: "vimeo", id: m[2], title: dec(m[1]), by: "Vimeo Staff Picks", mood: out.length % 2 ? "wonder" : "funny", url: "https://vimeo.com/" + m[2] });
  return shuffle(out).slice(0, 6);
}
async function fromArchive(c) {
  var page = 1 + Math.floor(Math.random() * 20);
  var u = "https://archive.org/advancedsearch.php?q=" + encodeURIComponent("collection:" + c[0] + " AND mediatype:movies") + "&fl[]=identifier&fl[]=title&rows=8&page=" + page + "&sort[]=downloads+desc&output=json";
  try {
    var j = JSON.parse(await get(u));
    return ((j.response && j.response.docs) || []).map(function (d) { return { src: "archive", id: d.identifier, title: dec(d.title), by: c[1], mood: c[2], url: "https://archive.org/details/" + d.identifier }; }).slice(0, 3);
  } catch (e) { return []; }
}

async function buildQueue(mood) {
  var lists = await Promise.all(YT.map(fromYouTube).concat([fromVimeo()], ARCHIVE.map(fromArchive)));
  var all = [].concat.apply([], lists);
  if (mood && MOODS.indexOf(mood) >= 0) all = all.filter(function (v) { return v.mood === mood; });
  // round-robin across sources so no channel runs twice in a row
  var by = {}; shuffle(all).forEach(function (v) { (by[v.by] = by[v.by] || []).push(v); });
  var names = shuffle(Object.keys(by)), q = [];
  for (var more = true; more;) { more = false; for (var i = 0; i < names.length; i++) { var v = by[names[i]].shift(); if (v) { q.push(v); more = true; } } }
  return q;
}

var CLIENT = [
  'var MOODS=["all","wonder","craft","weird","funny","calm"],mood=localStorage.m||"all",Q=[],i=-1,ready=false;',
  'var ban=JSON.parse(localStorage.ban||"[]");function $(x){return document.getElementById(x)}',
  'function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}',
  'function bar(){$("bar").innerHTML=MOODS.map(function(m){return "<button class="+(m==mood?"on":"")+" onclick=setMood(\\""+m+"\\")>"+m+"</button>"}).join("")+"<button onclick=prev()>&larr;</button><button onclick=next()>next &rarr;</button><button onclick=nope()>not this channel</button><button onclick=load()>reshuffle</button>"}',
  'function setMood(m){mood=m;localStorage.m=m;bar();load()}',
  'async function load(){var r=await fetch("/api/queue"+(mood=="all"?"":"?mood="+mood));Q=(await r.json()).queue.filter(function(v){return ban.indexOf(v.by)<0});i=-1;next()}',
  'function next(){if(i+1>=Q.length)return load();i++;play()}function prev(){if(i>0){i--;play()}}',
  'function nope(){var v=Q[i];if(!v)return;ban.push(v.by);localStorage.ban=JSON.stringify(ban);Q=Q.filter(function(x){return x.by!=v.by});i--;next()}',
  'function play(){var v=Q[i];if(!v)return;$("info").innerHTML="<b>"+esc(v.title)+"</b> &middot; "+esc(v.by)+" &middot; "+(i+1)+"/"+Q.length+" &middot; <a href="+v.url+" target=_blank rel=noopener>open</a>";',
  'if(v.src=="youtube"){if(!ready)return;$("stage").innerHTML="<div id=yt></div>";new YT.Player("yt",{videoId:v.id,playerVars:{autoplay:1,rel:0},events:{onStateChange:function(e){if(e.data==0)next()},onError:function(){next()}}})}',
  'else if(v.src=="vimeo"){$("stage").innerHTML="<iframe allow=\\"autoplay;fullscreen\\" allowfullscreen src=\\"https://player.vimeo.com/video/"+v.id+"?autoplay=1\\"></iframe>"}',
  'else{$("stage").innerHTML="<iframe allowfullscreen src=\\"https://archive.org/embed/"+encodeURIComponent(v.id)+"\\"></iframe>"}}',
  'window.onYouTubeIframeAPIReady=function(){ready=true;if(Q[i]&&Q[i].src=="youtube")play()};',
  'document.onkeydown=function(e){if(e.key=="ArrowRight")next();if(e.key=="ArrowLeft")prev()};bar();load();'
].join("\n");

var PAGE = '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>watch</title>' +
  '<style>body{margin:0;background:#111;color:#eee;font:16px system-ui;display:flex;flex-direction:column;height:100vh}' +
  '#bar{display:flex;gap:6px;padding:8px;flex-wrap:wrap}button{background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:6px;padding:8px 12px;font:inherit;cursor:pointer}button.on{background:#e8b923;color:#111}' +
  '#stage{flex:1;min-height:0;position:relative}#stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0}' +
  '#info{padding:8px 12px;font-size:14px;color:#bbb}#info b{color:#fff}a{color:#e8b923}</style>' +
  '<div id=bar></div><div id=stage></div><div id=info></div><script src="https://www.youtube.com/iframe_api"></script><script>' + CLIENT + '</script>';

export default {
  async fetch(req) {
    var u = new URL(req.url), h = { "Referrer-Policy": "strict-origin-when-cross-origin", "X-Content-Type-Options": "nosniff" };
    if (u.pathname === "/health") return Response.json({ worker: "personal-watch", version: VERSION, channels: YT.length }, { headers: h });
    if (u.pathname === "/api/queue") {
      var q = await buildQueue(u.searchParams.get("mood"));
      return Response.json({ version: VERSION, count: q.length, queue: q }, { headers: Object.assign({ "Cache-Control": "no-store" }, h) });
    }
    if (u.pathname === "/") return new Response(PAGE, { headers: Object.assign({ "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "DENY" }, h) });
    return new Response("not found", { status: 404, headers: h });
  }
};
