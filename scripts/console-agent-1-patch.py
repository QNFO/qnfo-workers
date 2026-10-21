#!/usr/bin/env python3
"""
FLEET-CONSOLE-AGENT-1 -- idempotent, fail-closed.

WHY
---
The fleet dashboard's command line (`/api/cmd`) parses a fixed grammar (sql,
call, dispatch, deploy, merge, closepr, rerun) and, for anything else, falls
back to `cmdRunAi` -- a capped, context-only Workers AI completion that
PROPOSES actions as text and has no tools. It cannot read a file, run code,
touch a container, query D1, open a PR or deploy. Verified in the clone:
CON_OPS (worker.js L11365) holds only fleet-control verbs, and the NL path
ends in the capped completion, not in an agent loop.

FIX
---
Hand free text to the fleet's real agent loop: qnfo-ops over the existing
service binding (SVC_QNFO_OPS), which has run_code, container shell
(shell_exec/exec_python/exec_node), GitHub, D1 writes and cf_worker_deploy.

Auth needs no new secret. qnfo-ops authOk() promotes a request out of public
read-only mode when it carries `Authorization: Bearer qos_<64hex>`
(qnfo-ops/worker.js L6554), and POST /v1/owner/login + /v1/owner/verify mint
exactly that token with no key. The dashboard already gates every console op
on conIsOwner(), so the token is only ever minted for the owner.

Long runs never block the dashboard: the proxy sends `x-ops-async: 1`, so
qnfo-ops returns {id, poll} and the console polls `agent-status <id>`.

Commands: `agent <request>`, `agent-login`, `agent-verify <6 digits>`,
`agent-status <job id>`.

Idempotent: MARKER present -> nothing written. Fail-closed: a missing or
ambiguous anchor writes nothing and exits non-zero (PARTIAL-APPLY-1 reverts).
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = [
    "qnfo-fleet-dashboard/worker.js",
    "qnfo-fleet-dashboard/deployed-current.worker.js",
]
MARKER = "FLEET-CONSOLE-AGENT-1"

CON_OPS_ADD = (
    '  agent: { destructive: false, label: "Ask the fleet agent (code, containers, deploys)" },\n'
    '  agentlogin: { destructive: false, label: "Email the agent sign-in code" },\n'
    '  agentverify: { destructive: false, label: "Exchange the agent code for a session" },\n'
    '  agentstatus: { destructive: false, label: "Agent job status" },\n'
)

PARSE_HOOK = r'''
  // FLEET-CONSOLE-AGENT-1: free text goes to the fleet's real agent loop
  // (qnfo-ops over the service binding) -- run_code, container shell, GitHub,
  // D1 writes and deploys -- not the capped context-only completion.
  {
    const at = String(text == null ? "" : text).trim();
    let am;
    if ((am = /^agent\s+([\s\S]+)$/i.exec(at))) return { actions: [cmdAction("agent", { text: am[1].slice(0, 8000) })], auto: true, text: "Fleet agent: " + am[1].slice(0, 160) };
    if (/^agent-login$/i.test(at)) return { actions: [cmdAction("agentlogin", {})], auto: true, text: "Email the agent sign-in code" };
    if ((am = /^agent-verify\s+(\d{6})$/i.exec(at))) return { actions: [cmdAction("agentverify", { code: am[1] })], auto: true, text: "Verify the agent code" };
    if ((am = /^agent-status\s+(\S+)$/i.exec(at))) return { actions: [cmdAction("agentstatus", { id: am[1] })], auto: true, text: "Agent job " + am[1] };
  }
'''

TOKEN_HELPER = r'''
// FLEET-CONSOLE-AGENT-1: the stored qnfo-ops owner session, or null.
async function conAgentToken(env) {
  try {
    const row = await env.AUDIT.prepare("SELECT token FROM console_agent_auth WHERE id = 1").first();
    const t = row && row.token;
    return t && /^qos_[0-9a-f]{64}$/.test(t) ? t : null;
  } catch (e) { return null; }
}
'''

EXEC_HOOK = r'''    // FLEET-CONSOLE-AGENT-1: proxy to the real fleet agent loop.
    if (op === "agent" || op === "agentlogin" || op === "agentverify" || op === "agentstatus") {
      const svc = env.SVC_QNFO_OPS;
      if (!svc) return { ok: false, error: "no service binding to qnfo-ops (SVC_QNFO_OPS)" };
      const opsCall = async (p, init, ms) => {
        const r = await svc.fetch("https://ops.qnfo.org" + p, Object.assign({}, init || {}, { signal: AbortSignal.timeout(ms || 25e3) }));
        const t = await r.text();
        let j = null;
        try { j = JSON.parse(t); } catch (e) {}
        return { status: r.status, text: t, json: j };
      };
      if (op === "agentlogin") {
        const r = await opsCall("/v1/owner/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const j = r.json || {};
        return { ok: r.status < 400 && j.ok !== false, text: "agent sign-in: " + (j.note || j.error || ("HTTP " + r.status)) };
      }
      if (op === "agentverify") {
        const code = String((args && args.code) || "").trim();
        if (!/^\d{6}$/.test(code)) return { ok: false, error: "agent-verify needs the 6-digit code from the email" };
        const r = await opsCall("/v1/owner/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code }) });
        const j = r.json || {};
        const tok = j.owner_session;
        if (!tok) return { ok: false, error: "agent-verify: " + (j.error || ("HTTP " + r.status)) };
        await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS console_agent_auth (id INTEGER PRIMARY KEY CHECK (id = 1), token TEXT NOT NULL, ts TEXT)").run();
        await env.AUDIT.prepare("INSERT INTO console_agent_auth (id, token, ts) VALUES (1, ?1, datetime('now')) ON CONFLICT(id) DO UPDATE SET token = ?1, ts = datetime('now')").bind(tok).run();
        return { ok: true, text: "agent session stored (" + (j.expires_in_hours || 12) + "h). Now: agent <what you want done>" };
      }
      if (op === "agentstatus") {
        const tok = await conAgentToken(env);
        if (!tok) return { ok: false, error: "no agent session: agent-login, then agent-verify <code>" };
        const id = String((args && args.id) || "").trim();
        const r = await opsCall("/v1/jobs/" + encodeURIComponent(id), { headers: { Authorization: "Bearer " + tok } }, 30e3);
        if (r.status === 401) return { ok: false, error: "agent session expired: agent-login, then agent-verify <code>" };
        return { ok: r.status < 400, text: "job " + id + " -> HTTP " + r.status + "\n" + String(r.text).slice(0, 3000) };
      }
      const text = String((args && args.text) || "").trim();
      if (!text) return { ok: false, error: "agent needs a request: agent <what you want done>" };
      const tok = await conAgentToken(env);
      if (!tok) return { ok: false, error: "no agent session yet: type agent-login, then agent-verify <code>" };
      const r = await opsCall("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok, "x-ops-async": "1" },
        body: JSON.stringify({ model: "ops", messages: [{ role: "user", content: text.slice(0, 8000) }] })
      }, 30e3);
      if (r.status === 401) return { ok: false, error: "agent session expired: agent-login, then agent-verify <code>" };
      if (r.status >= 400) return { ok: false, error: "agent -> HTTP " + r.status + ": " + String(r.text).slice(0, 400) };
      const j = r.json || {};
      const id = j.id || j.job_id;
      return { ok: true, text: id ? ("agent job " + id + " queued. Track: agent-status " + id) : String(r.text).slice(0, 2000) };
    }
'''


def sub1(s, anchor, repl, label, path):
    n = s.count(anchor)
    if n != 1:
        print("FAIL %s: anchor %r matched %d times" % (path, label, n))
        sys.exit(1)
    return s.replace(anchor, repl, 1)


def patch(path):
    p = os.path.join(ROOT, path)
    with open(p, "r", encoding="utf-8") as f:
        s = f.read()
    if MARKER in s:
        print("SKIP %s: already applied" % path)
        return False
    o = s
    s = sub1(s, "var CON_OPS = {\n", "var CON_OPS = {\n" + CON_OPS_ADD, "CON_OPS", path)
    s = sub1(s, "function conParse(text) {\n", "function conParse(text) {\n" + PARSE_HOOK, "conParse", path)
    s = sub1(s, "async function conExec(env, owner, op, args) {", TOKEN_HELPER + "\nasync function conExec(env, owner, op, args) {", "conExec", path)
    s = sub1(s, '    if (op === "dispatch") {', EXEC_HOOK + '    if (op === "dispatch") {', "dispatch", path)
    s, n = re.subn(r'var VERSION = "[^"]*";', 'var VERSION = "1.53.0-console-agent-1";', s, count=1)
    if n != 1:
        print("FAIL %s: VERSION anchor matched %d times" % (path, n))
        sys.exit(1)
    if s == o:
        print("FAIL %s: no change" % path)
        sys.exit(1)
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)
    print("OK %s: +%d bytes" % (path, len(s) - len(o)))
    return True


changed = 0
for t in TARGETS:
    if patch(t):
        changed += 1
print("changed=%d" % changed)
