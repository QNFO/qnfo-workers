// ---- VOICE-INPUT-1:BEGIN (sourced from _shared/voice.js; applied by scripts/voice-apply.mjs; do not edit inside a worker) ----
// VOICE-INPUT-1 (2026-11-09, pillar reach; owner directive: "everywhere there's a text box or a prompt I want the microphone to work,
// like a Google search bar, on Android, desktop, whatever"). One block, inlined into every worker that serves HTML, that
//   1. serves /__voice.js, a tiny script that puts a mic button on every free-text field (textarea, text/search input), including fields
//      added later, and fills the field with what is said (Web Speech API; on a browser without it, a recording sent to /__voice/transcribe);
//   2. serves POST /__voice/transcribe (same-origin only, 4 MB, 12 a minute per address and isolate), forwarded to the dashboard's speech route;
//   3. injects the script tag into each 200 HTML page and sets Permissions-Policy microphone=(self) when the origin sent none or sent a
//      policy that blocks the microphone (the *.qnfo.org zone rule had forced microphone=() until MIC-ZONE-1 changed it to (self)).
// Opt a field out with data-novoice. Honeypots, passwords, numbers, e-mails and codes are skipped by the script itself.
var VX_VERSION = "1.0.0";
var VX_RATE = {};
var VX_STT_URL = "https://fleet.qnfo.org/__voice/stt";
function vxNop(e) { return e; }
var VX_CLIENT = "(function(){if(window.__vx)return;window.__vx=1;" +
"var SR=window.SpeechRecognition||window.webkitSpeechRecognition,MR=!!(window.MediaRecorder&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);" +
"if(!SR&&!MR)return;" +
"function nop(e){return e}" +
"var css=document.createElement('style');css.textContent='.vx-b{position:fixed;z-index:2147483000;width:36px;height:36px;border-radius:50%;border:1px solid rgba(128,128,128,.45);background:rgba(255,255,255,.92);color:#444;cursor:pointer;padding:0;display:none;align-items:center;justify-content:center;touch-action:manipulation;-webkit-tap-highlight-color:transparent;box-shadow:0 1px 4px rgba(0,0,0,.25)}.vx-b svg{width:18px;height:18px;fill:currentColor;pointer-events:none}.vx-b.on{display:flex}.vx-b.rec{background:#d93025;color:#fff;border-color:#d93025;animation:vxp 1.1s infinite}.vx-b.err{background:#fce8e6;color:#b3261e}@keyframes vxp{50%{box-shadow:0 0 0 7px rgba(217,48,37,.18)}}@media(prefers-color-scheme:dark){.vx-b{background:rgba(40,40,40,.92);color:#ddd}}.vx-t{position:fixed;z-index:2147483001;left:12px;right:12px;bottom:16px;max-width:420px;margin:0 auto;background:#202124;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.4)}';document.head.appendChild(css);" +
"var ICON='<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z\"/></svg>';" +
"var map=new Map(),active=null,toastEl=null,toastT=0,raf=0;" +
"function toast(m){if(!toastEl){toastEl=document.createElement('div');toastEl.className='vx-t';toastEl.setAttribute('role','status');document.body.appendChild(toastEl)}toastEl.textContent=m;toastEl.style.display='block';clearTimeout(toastT);toastT=setTimeout(function(){toastEl.style.display='none'},5000)}" +
"function eligible(el){if(!el||el.nodeType!==1||el.dataset.novoice!==undefined||el.disabled||el.readOnly)return false;var t=el.tagName;if(t==='TEXTAREA')return true;if(t!=='INPUT')return false;var ty=(el.getAttribute('type')||'text').toLowerCase();if(ty!=='text'&&ty!=='search')return false;if(el.tabIndex<0||el.getAttribute('aria-hidden')==='true')return false;var im=(el.getAttribute('inputmode')||'').toLowerCase();if(/^(numeric|decimal|tel|email|url)$/.test(im))return false;var ac=(el.getAttribute('autocomplete')||'').toLowerCase();if(/one-time-code|email|username|tel|cc-/.test(ac))return false;if(/^(website|url|hp|qz_hp|honeypot|code|otp)$/i.test(el.name||''))return false;return true}" +
"function hasOwnMic(el){var p=el.parentElement,n=0;while(p&&n<3){var bs=p.querySelectorAll('button,[role=button]');for(var i=0;i<bs.length;i++){var b=bs[i];if(b.classList.contains('vx-b'))continue;var s=(b.id+' '+b.className+' '+(b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).toLowerCase();if(/\\b(mic|speak|dictat|voice)/.test(s)&&b.offsetParent!==null)return true}p=p.parentElement;n++}return false}" +
"function setVal(el,v){var proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,d=Object.getOwnPropertyDescriptor(proto,'value');if(d&&d.set)d.set.call(el,v);else el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))}" +
"function sep(base){return base&&!/\\s$/.test(base)?' ':''}" +
"function stop(){if(!active)return;var a=active;active=null;a.stopped=true;try{a.rec&&a.rec.stop()}catch(e){nop(e)}try{a.mr&&a.mr.state!=='inactive'&&a.mr.stop()}catch(e){nop(e)}if(a.stream)a.stream.getTracks().forEach(function(t){t.stop()});a.btn.classList.remove('rec');a.btn.setAttribute('aria-label','Speak into this box')}" +
"function fail(btn,m){btn.classList.add('err');setTimeout(function(){btn.classList.remove('err')},2500);toast(m)}" +
"function errMsg(e){return e==='not-allowed'||e==='service-not-allowed'?'The microphone is blocked. Allow it for this site in the browser settings (lock icon in the address bar), then tap the mic again.':e==='no-speech'?'Heard nothing. Tap the mic and speak.':e==='audio-capture'?'No microphone found on this device.':e==='network'?'Speech recognition needs a connection. Try again.':'Voice input stopped ('+e+').'}" +
"function startSR(el,btn){var a={btn:btn,base:el.value,fin:'',lastErr:'',empty:0};active=a;btn.classList.add('rec');btn.setAttribute('aria-label','Stop and keep what you said');" +
"function run(){var r=new SR();a.rec=r;r.lang=document.documentElement.lang||navigator.language||'en-US';r.interimResults=true;r.continuous=false;r.maxAlternatives=1;" +
"r.onresult=function(e){var interim='',got=false;for(var i=e.resultIndex;i<e.results.length;i++){var t=e.results[i][0].transcript;if(e.results[i].isFinal){a.fin+=(a.fin&&!/\\s$/.test(a.fin)?' ':'')+t.trim();got=true}else interim+=t}if(got)a.empty=0;var spoken=(a.fin+(interim?(a.fin?' ':'')+interim:'')).trim();setVal(el,a.base+sep(a.base)+spoken)};" +
"r.onerror=function(e){a.lastErr=e.error};" +
"r.onend=function(){if(active!==a)return;if(a.lastErr&&a.lastErr!=='no-speech'&&a.lastErr!=='aborted'){var m=errMsg(a.lastErr);stop();fail(btn,m);return}if(a.lastErr==='no-speech'||!a.fin)a.empty++;a.lastErr='';if(a.empty>=2){stop();return}a.base=el.value;a.fin='';try{run()}catch(x){stop()}};" +
"r.start()}" +
"try{run()}catch(e){stop();fail(btn,'Voice input could not start.')}}" +
"function startMR(el,btn){navigator.mediaDevices.getUserMedia({audio:true}).then(function(s){var a={btn:btn,stream:s};active=a;var ch=[],mr=new MediaRecorder(s);a.mr=mr;btn.classList.add('rec');btn.setAttribute('aria-label','Stop and transcribe');mr.ondataavailable=function(e){if(e.data&&e.data.size)ch.push(e.data)};mr.onstop=function(){s.getTracks().forEach(function(t){t.stop()});var blob=new Blob(ch,{type:mr.mimeType||'audio/webm'});btn.classList.remove('rec');if(!blob.size)return;btn.disabled=true;toast('Transcribing...');fetch('/__voice/transcribe',{method:'POST',headers:{'x-voice':'1','Content-Type':blob.type},body:blob,credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){btn.disabled=false;if(j&&j.ok&&j.text){var v=el.value;setVal(el,v+sep(v)+j.text);el.focus();toastEl&&(toastEl.style.display='none')}else fail(btn,(j&&j.error)||'Could not transcribe that.')}).catch(function(){btn.disabled=false;fail(btn,'Could not reach the speech service.')})};mr.start()}).catch(function(e){fail(btn,e&&e.name==='NotAllowedError'?errMsg('not-allowed'):errMsg('audio-capture'))})}" +
"function toggle(el,btn){if(active){var same=active.btn===btn;stop();if(same)return}try{el.focus()}catch(e){nop(e)}if(SR)startSR(el,btn);else startMR(el,btn)}" +
"function attach(el){if(map.has(el)||!eligible(el)||hasOwnMic(el))return;var b=document.createElement('button');b.type='button';b.className='vx-b';b.innerHTML=ICON;b.setAttribute('aria-label','Speak into this box');b.title='Speak instead of typing';b.addEventListener('mousedown',function(e){e.preventDefault()});b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();toggle(el,b)});document.body.appendChild(b);map.set(el,b);place()}" +
"function place(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;var vw=innerWidth,vh=innerHeight;map.forEach(function(b,el){if(!el.isConnected){b.remove();map.delete(el);return}var r=el.getBoundingClientRect(),cs=getComputedStyle(el),ok=r.width>=80&&r.height>=20&&cs.visibility!=='hidden'&&cs.display!=='none'&&r.bottom>0&&r.top<vh&&r.right>0&&r.left<vw;if(!ok){b.classList.remove('on');return}var sz=r.height<44?28:36;b.style.width=b.style.height=sz+'px';var top=r.height<60?r.top+(r.height-sz)/2:r.bottom-sz-6,left=Math.min(r.right-sz-6,vw-sz-4);b.style.top=Math.max(2,top)+'px';b.style.left=Math.max(2,left)+'px';b.classList.add('on')})})}" +
"function scan(root){var q=(root&&root.querySelectorAll?root:document).querySelectorAll('textarea,input');for(var i=0;i<q.length;i++)attach(q[i]);if(root&&root.tagName&&(root.tagName==='TEXTAREA'||root.tagName==='INPUT'))attach(root)}" +
"scan(document);new MutationObserver(function(ms){var any=false;ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1){scan(n);any=true}})});place()}).observe(document.documentElement,{childList:true,subtree:true});" +
"['scroll','resize','input','focusin','transitionend','animationend'].forEach(function(ev){addEventListener(ev,place,true)});setInterval(place,1500);" +
"document.addEventListener('keydown',function(e){if(e.key==='Escape'&&active)stop()});" +
"})();";
function vxHeaders(h) {
  try {
    var pp = h.get("Permissions-Policy");
    if (!pp) {
      h.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
    } else if (/microphone\s*=\s*\(\s*\)/i.test(pp)) {
      h.set("Permissions-Policy", pp.replace(/microphone\s*=\s*\(\s*\)/i, "microphone=(self)"));
    } else if (!/microphone/i.test(pp)) {
      h.set("Permissions-Policy", pp + ", microphone=(self)");
    }
    var csp = h.get("Content-Security-Policy");
    if (csp && /script-src/.test(csp) && !/script-src[^;]*'none'/.test(csp) && !/script-src[^;]*'self'/.test(csp)) {
      h.set("Content-Security-Policy", csp.replace(/script-src/, "script-src 'self'"));
    }
    if (csp && /connect-src/.test(csp) && !/connect-src[^;]*'self'/.test(csp) && !/connect-src[^;]*\*/.test(csp)) {
      h.set("Content-Security-Policy", h.get("Content-Security-Policy").replace(/connect-src/, "connect-src 'self'"));
    }
    h.set("X-Voice-Input", VX_VERSION);
  } catch (e) { vxNop(e); }
}
async function vxTranscribe(request, env) {
  var j = function (o, s) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); };
  var u = new URL(request.url);
  var origin = request.headers.get("Origin");
  if (request.headers.get("x-voice") !== "1" || (origin && origin !== u.origin) || request.headers.get("Sec-Fetch-Site") === "cross-site") return j({ ok: false, error: "same-origin voice requests only" }, 403);
  var ip = request.headers.get("CF-Connecting-IP") || "x", now = Date.now(), w = (VX_RATE[ip] || []).filter(function (t) { return now - t < 60000; });
  if (w.length >= 12) return j({ ok: false, error: "Too many recordings this minute. Wait a few seconds." }, 429);
  w.push(now); VX_RATE[ip] = w;
  var buf = await request.arrayBuffer();
  if (!buf.byteLength) return j({ ok: false, error: "empty recording" }, 400);
  if (buf.byteLength > 4194304) return j({ ok: false, error: "Recording over 4 MB; speak in shorter pieces." }, 413);
  // One speech-to-text implementation for the fleet: the dashboard sets globalThis.__vxStt (its own attributed AI binding); every other
  // worker forwards the bytes to it, so no other worker carries a second speech-model call site.
  try {
    if (typeof globalThis.__vxStt === "function") return j(await globalThis.__vxStt(buf, request.headers.get("Content-Type") || "audio/webm", env), 200);
    var fr = await fetch(VX_STT_URL, { method: "POST", headers: { "Content-Type": request.headers.get("Content-Type") || "audio/webm", "x-voice-fwd": "1" }, body: buf });
    var fj = await fr.json();
    return j(fj, fr.status === 200 ? 200 : 502);
  } catch (e) { return j({ ok: false, error: "Could not reach the speech service." }, 502); }
}
function vxAttach(target, workerName) {
  try {
    if (!target || typeof target.fetch !== "function" || target.__vx === VX_VERSION) return target;
    var orig = target.fetch;
    target.fetch = async function (request, env, ctx) {
      var u;
      try { u = new URL(request.url); } catch (e) { return orig.call(this, request, env, ctx); }
      if (u.pathname === "/__voice.js" && request.method === "GET") {
        return new Response(VX_CLIENT, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-Voice-Input": VX_VERSION } });
      }
      if (u.pathname === "/__voice/transcribe" && request.method === "POST") return vxTranscribe(request, env);
      var res = await orig.call(this, request, env, ctx);
      try {
        var ct = (res && res.headers.get("Content-Type") || "").toLowerCase();
        if (!res || res.status === 101 || ct.indexOf("text/html") !== 0) return res;
        var out = res;
        if (request.method === "GET" && res.status === 200 && typeof HTMLRewriter !== "undefined" && !/script-src[^;]*'none'/.test(res.headers.get("Content-Security-Policy") || "")) {
          out = new HTMLRewriter().on("body", { element: function (el) { el.onEndTag(function (t) { t.before('<script src="/__voice.js" defer></script>', { html: true }); }); } }).transform(res);
          out.headers.delete("Content-Length"); out.headers.delete("ETag");
        } else {
          out = new Response(res.body, res);
        }
        vxHeaders(out.headers);
        return out;
      } catch (e) { return res; }
    };
    target.__vx = VX_VERSION;
    return target;
  } catch (e) { return target; }
}
// ---- VOICE-INPUT-1:END ----
