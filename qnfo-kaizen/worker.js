var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var VERSION = "0.3.0-p2"; // 2026-09-04: fix NaN in weekly report string (stray unary + between "## Ops AI Gateway" and "## Top 10" sections)
var MAX_CLAIM_PER_RUN = 20;
var MAX_APPLY_PER_RUN = 5;
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" }
  });
}
__name(json, "json");
__name2(json, "json");
__name22(json, "json");
function auth(req, env) {
  if (!env.KAIZEN_TOKEN) return false;
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t) return false;
  const a = new TextEncoder().encode(t);
  const b = new TextEncoder().encode(env.KAIZEN_TOKEN);
  if (a.byteLength !== b.byteLength) return false;
  let d = 0;
  for (let i = 0; i < a.byteLength; i++) d |= a[i] ^ b[i];
  return d === 0;
}
__name(auth, "auth");
__name2(auth, "auth");
__name22(auth, "auth");
function daysSince(isoStr) {
  if (!isoStr) return 999;
  const t = new Date(isoStr).getTime();
  if (isNaN(t)) return 999;
  return Math.max(0, Math.round((Date.now() - t) / 864e5));
}
__name(daysSince, "daysSince");
__name2(daysSince, "daysSince");
__name22(daysSince, "daysSince");
async function listSkillFiles(env) {
  const byName = /* @__PURE__ */ new Map();
  let cursor;
  do {
    const listed = await env.SKILLS_BUCKET.list({ limit: 1e3, cursor });
    for (const obj of listed.objects) {
      if (!obj.key.endsWith("SKILL.md")) continue;
      const parts = obj.key.split("/");
      if (parts.length < 2) continue;
      if (parts[0] === "_sync" || parts[0] === "projects") continue;
      const skill = parts[parts.length - 2];
      const existing = byName.get(skill);
      if (!existing || new Date(obj.uploaded) > new Date(existing.lastModified)) {
        byName.set(skill, { key: obj.key, skill, size: obj.size, lastModified: obj.uploaded });
      }
    }
    cursor = listed.truncated ? listed.cursor : void 0;
  } while (cursor);
  return Array.from(byName.values());
}
__name(listSkillFiles, "listSkillFiles");
__name2(listSkillFiles, "listSkillFiles");
__name22(listSkillFiles, "listSkillFiles");
async function readSkillBody(env, key) {
  const obj = await env.SKILLS_BUCKET.get(key);
  if (!obj) return "";
  return await obj.text();
}
__name(readSkillBody, "readSkillBody");
__name2(readSkillBody, "readSkillBody");
__name22(readSkillBody, "readSkillBody");
function parseVersion(body) {
  const m = body.match(/Current:\s*\*\*v([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
  return m ? m[1] : "";
}
__name(parseVersion, "parseVersion");
__name2(parseVersion, "parseVersion");
__name22(parseVersion, "parseVersion");
function parseName(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "";
}
__name(parseName, "parseName");
__name2(parseName, "parseName");
__name22(parseName, "parseName");
function findDrift(body, skillName) {
  const refs = [];
  const re = /(See|Load|activates?)\s+([a-z0-9-]+)(?:\s+skill)?\s+v([0-9]+\.[0-9]+)/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    refs.push({ target: m[2], version: m[3], context: m[1] });
  }
  return refs;
}
__name(findDrift, "findDrift");
__name2(findDrift, "findDrift");
__name22(findDrift, "findDrift");
async function runScan(env) {
  const started = Date.now();
  const files = await listSkillFiles(env);
  const skills = [];
  for (const f of files) {
    const body = await readSkillBody(env, f.key);
    skills.push({
      skill: f.skill,
      name: parseName(body) || f.skill,
      version: parseVersion(body),
      stalenessDays: daysSince(f.lastModified),
      sizeBytes: f.size,
      lastModified: f.lastModified,
      crossRefs: findDrift(body, f.skill).length
    });
  }
  let incidents = {};
  try {
    const rows = await env.QNFO_AUDIT.prepare("SELECT source, COUNT(*) AS cnt FROM agent_issues WHERE status='open' GROUP BY source").all();
    for (const r of rows.results || []) incidents[(r.source || "other").toLowerCase()] = r.cnt;
  } catch (e) {
  }
  let opsStats = {};
  try {
    const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const oc = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) c FROM ops_ai_log WHERE ts >= ?1").bind(since7).first();
    const of = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) c FROM ops_ai_log WHERE ts >= ?1 AND ok = 0").bind(since7).first();
    const ol = await env.QNFO_AUDIT.prepare("SELECT model, COUNT(*) c, AVG(latency_ms) avg_ms FROM ops_ai_log WHERE ts >= ?1 GROUP BY model").bind(since7).all();
    opsStats = { chats7d: (oc && oc.c) || 0, failures7d: (of && of.c) || 0, byModel: (ol.results || []).map((r) => r.model + ":" + r.c + "@" + Math.round(r.avg_ms || 0) + "ms") };
  } catch (e2) {}
  const scored = skills.map((s) => {
    const stalenessScore = Math.min(1, s.stalenessDays / 90);
    const incidentScore = Math.min(1, (incidents[s.skill.toLowerCase()] || 0) / 5);
    const driftScore = Math.min(1, s.crossRefs / 3);
    const composite = +(stalenessScore * 0.4 + incidentScore * 0.3 + driftScore * 0.2).toFixed(3);
    return { ...s, stalenessScore: +stalenessScore.toFixed(2), incidentScore, driftScore, composite };
  });
  scored.sort((a, b) => b.composite - a.composite);
  const flagged = scored.filter((s) => s.composite > 0.7);
  const reportDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const findingsMd = "# Kaizen Report \u2014 " + reportDate + "\n\n- Worker: qnfo-kaizen v" + VERSION + "\n- Generated: " + (/* @__PURE__ */ new Date()).toISOString() + "\n- Skills scanned: " + scored.length + "\n- Flagged (composite > 0.7): " + flagged.length + "\n\n## Flagged\n" + (flagged.length ? flagged.map((f) => "- **" + f.skill + "** v" + f.version + " composite=" + f.composite + " (staleness " + f.stalenessDays + "d, incidents " + (incidents[f.skill.toLowerCase()] || 0) + ", refs " + f.crossRefs + ")").join("\n") : "- none") + "\n\n## Ops AI Gateway (7d)\n- chats: " + (opsStats.chats7d || 0) + "\n- failures: " + (opsStats.failures7d || 0) + "\n- by model: " + ((opsStats.byModel || []).join(", ") || "none") + "\n\n## Top 10 by composite\n" + scored.slice(0, 10).map((s) => "- " + s.skill + " v" + s.version + ": " + s.composite).join("\n");
  const reportId = "kaizen-" + reportDate + "-" + Date.now();
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO kaizen_reports (id, session_id, report_date, findings, improvements_applied, wbs_code) VALUES (?, ?, ?, ?, ?, ?)").bind(
      reportId,
      "qnfo-kaizen-cron",
      reportDate,
      findingsMd,
      JSON.stringify({ worker: "qnfo-kaizen", version: VERSION, scanned: scored.length, flagged: flagged.length, incidents, elapsedMs: Date.now() - started }),
      "QNFO.INF.KAIZEN.P3"
    ).run();
  } catch (e) {
  }
  return {
    ok: true,
    worker: "qnfo-kaizen",
    version: VERSION,
    reportId,
    reportDate,
    scanned: scored.length,
    flagged: flagged.length,
    elapsedMs: Date.now() - started,
    topFlagged: flagged.slice(0, 5).map((f) => ({ skill: f.skill, version: f.version, composite: f.composite, stalenessDays: f.stalenessDays })),
    skills: scored.slice(0, 25).map((s) => ({ skill: s.skill, version: s.version, stalenessDays: s.stalenessDays, crossRefs: s.crossRefs, composite: s.composite }))
  };
}
__name(runScan, "runScan");
__name2(runScan, "runScan");
__name22(runScan, "runScan");
var META_RE = /(add gate [A-Z0-9._-]+ to [a-z0-9-]+|meta-?knowledge|kaizen|improve the (system|pipeline|agent|process)|update (the )?(instructions?|skills?|prompts?|system prompt)|operating (procedure|protocol|policy|runbook))/i;
async function ensureMetaSchema(env) {
  await env.QNFO_AUDIT.prepare(
    "CREATE TABLE IF NOT EXISTS meta_claims (id TEXT PRIMARY KEY, intent_id TEXT UNIQUE, skill_target TEXT, gate_name TEXT, claim TEXT, evidence TEXT, confidence TEXT, scope TEXT, valid INTEGER, reason TEXT, status TEXT, created_at TEXT, applied_at TEXT)"
  ).run();
  await env.QNFO_AUDIT.prepare(
    "CREATE TABLE IF NOT EXISTS meta_changes (id TEXT PRIMARY KEY, claim_id TEXT, intent_id TEXT, skill TEXT, key TEXT, section TEXT, git_push TEXT, created_at TEXT)"
  ).run();
}
__name(ensureMetaSchema, "ensureMetaSchema");
__name2(ensureMetaSchema, "ensureMetaSchema");
__name22(ensureMetaSchema, "ensureMetaSchema");
function tryJson(s) {
  if (typeof s !== "string") return s || null;
  const blocks = [];
  const re = /\{[\s\S]*?\}/g;
  let m;
  while ((m = re.exec(s)) !== null) blocks.push(m[0]);
  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(blocks[i]);
    } catch (e) {
    }
  }
  return null;
}
__name(tryJson, "tryJson");
__name2(tryJson, "tryJson");
__name22(tryJson, "tryJson");
async function validateClaim(env, desire, skillNames, hint) {
  const prompt = `Meta-knowledge validation pass (FRAMEWORK-DOGFOOD-1 claim-sheet gate).
Input is a meta-knowledge statement about how the QNFO autonomous research system should operate.
Return JSON ONLY: {"valid":true|false,"skill_target":"<existing skill name or empty string>","gate_name":"<short uppercase gate id, e.g. META-TEST-1>","claim":"<one-sentence behavioral claim>","evidence":"<short evidence pointer>","confidence":"high|medium|low","scope":"<which skill/protocol this applies to>","reason":"<why invalid if false, else empty>"}
Rules:
- valid=true ONLY if: (1) names a concrete behavioral gate/rule/protocol; (2) is additive, not contradicting or destructive; (3) skill_target names a skill EXACTLY from the existing list; (4) claim and evidence are non-empty; (5) not a question, not a vague opinion, not a duplicate of a gate named in the statement's own context.
- Reject: vague opinions, questions, destructive edits, and any statement that would create a new skill.
Existing skills: ` + skillNames.join(", ") + "\nDo not output reasoning or commentary. Output ONLY the JSON object, nothing before or after it.\n" + (hint ? hint + "\n" : "") + "META STATEMENT: " + String(desire || "").slice(0, 3e3);
  try {
    const r = await env.AI.run("@cf/zai-org/glm-5.2", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2500,
      temperature: 0.2
    });
    const text = r && r.choices && r.choices[0] && r.choices[0].message ? String(r.choices[0].message.content || r.choices[0].message.reasoning_content || "") : r && (r.response || r.result) ? String(r.response || r.result) : "";
    return tryJson(text);
  } catch (e) {
    return { valid: false, reason: "ai-error: " + (e && e.message ? e.message : String(e)).slice(0, 120) };
  }
}
__name(validateClaim, "validateClaim");
__name2(validateClaim, "validateClaim");
__name22(validateClaim, "validateClaim");
async function runMeta(env, commit, limit) {
  await ensureMetaSchema(env);
  const out = { claimed: [], errors: [], commit };
  const rows = await env.QNFO_AUDIT.prepare(
    "SELECT id, desire, type, created_at FROM intents WHERE status='pending' AND (triage_decision IS NULL OR triage_decision='') ORDER BY created_at ASC LIMIT ?1"
  ).bind(Math.min(limit || MAX_CLAIM_PER_RUN, 50)).all();
  const candidates = [];
  for (const row of rows.results || []) {
    const t = String(row.desire || "");
    if (row.type === "meta" && row.type !== "research") candidates.push(row);
    else if (row.type !== "research" && /(meta-?knowledge|meta.?update|system improvement|kaizen|protocol update|procedure update)/i.test(t) && META_RE.test(t)) candidates.push(row);
  }
  const files = await listSkillFiles(env);
  const skillNames = files.map((f) => f.skill);
  for (const row of candidates) {
    try {
      if (!commit) {
        out.claimed.push({ id: row.id, preview: "would-validate" });
        continue;
      }
      const tm = String(row.desire || "").match(/\b(?:add gate [A-Z0-9._-]+ to|target(?:ing)? (?:the )?(?:skill )?|update (?:the )?(?:skill )?|append to (?:skill )?)([a-z0-9._-]+)(?:\s+skill)?\b/i);
      const tgt = tm ? tm[1].toLowerCase() : null;
      let hint = null;
      if (tgt) hint = skillNames.map((s) => s.toLowerCase()).includes(tgt) ? "HINT: " + tm[1] + " IS in the existing skills list, so rule 3 passes for it." : "HINT: " + tm[1] + " is NOT in the existing skills list - rule 3 fails unless the statement names another target.";
      const v = await validateClaim(env, row.desire, skillNames, hint);
      if (!v || v.valid !== true) {
        await env.QNFO_AUDIT.prepare("UPDATE intents SET triage_decision='META-INVALID', triage_rationale=?, triaged_at=?, status='triaged' WHERE id=?").bind(String(v && v.reason || "no valid claim-sheet").slice(0, 300), (/* @__PURE__ */ new Date()).toISOString(), row.id).run();
        out.claimed.push({ id: row.id, valid: false, reason: v && v.reason || "unparseable" });
        continue;
      }
      const cid = crypto.randomUUID();
      await env.QNFO_AUDIT.prepare(
        "INSERT OR IGNORE INTO meta_claims (id, intent_id, skill_target, gate_name, claim, evidence, confidence, scope, valid, reason, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,'', 'validated', ?9)"
      ).bind(cid, row.id, String(v.skill_target || "").toLowerCase(), String(v.gate_name || "META-" + row.id.slice(-6)).toUpperCase(), String(v.claim || "").slice(0, 500), String(v.evidence || "").slice(0, 300), String(v.confidence || "medium"), String(v.scope || "").slice(0, 300), (/* @__PURE__ */ new Date()).toISOString()).run();
      await env.QNFO_AUDIT.prepare("UPDATE intents SET triage_decision='META', triage_rationale='meta loop: claim ' || ?1, triaged_at=?, status='triaged' WHERE id=?").bind(String(v.gate_name || ""), (/* @__PURE__ */ new Date()).toISOString(), row.id).run();
      out.claimed.push({ id: row.id, valid: true, gate: v.gate_name, skill: v.skill_target });
    } catch (e) {
      out.errors.push({ id: row.id, error: e && e.message ? e.message : String(e) });
    }
  }
  return out;
}
__name(runMeta, "runMeta");
__name2(runMeta, "runMeta");
__name22(runMeta, "runMeta");
function appendSection(env, body, claim) {
  const changeId = crypto.randomUUID().slice(0, 8);
  const section = "\n\n## " + claim.gate_name + " (autonomous meta-update " + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ", change " + changeId + ")\n\n" + claim.claim + "\n\n- Evidence: " + claim.evidence + "\n- Confidence: " + claim.confidence + "\n- Scope: " + claim.scope + "\n- Source: qnfo-kaizen v" + VERSION + " meta loop (intent " + claim.intent_id + "). Additive-only; no version bump. Git push: " + (env.GITHUB_TOKEN ? "worker" : "deferred to local skill_sync bridge") + ".\n";
  return { body: body.replace(/\s*$/, "") + section, changeId };
}
__name(appendSection, "appendSection");
__name2(appendSection, "appendSection");
__name22(appendSection, "appendSection");
async function pushToGitHub(env, key, content, message) {
  if (!env.GITHUB_TOKEN) return "deferred-no-token";
  try {
    const repo = "QNFO/qnfo-skills";
    const enc = encodeURIComponent(String(key || "").indexOf("prompts/skills/") === 0 ? String(key).slice(14) : String(key));
    const get = await fetch("https://api.github.com/repos/" + repo + "/contents/" + enc, {
      headers: { "Authorization": "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-kaizen/" + VERSION, "Accept": "application/vnd.github+json" }
    });
    const sha = get.ok ? (await get.json()).sha : null;
    const put = await fetch("https://api.github.com/repos/" + repo + "/contents/" + enc, {
      method: "PUT",
      headers: { "Authorization": "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-kaizen/" + VERSION, "Content-Type": "application/json", "Accept": "application/vnd.github+json" },
      body: JSON.stringify({ message, content: btoa(String.fromCharCode(...new TextEncoder().encode(content))), ...sha ? { sha } : {} })
    });
    return put.ok ? "pushed" : "push-http-" + put.status;
  } catch (e) {
    return "push-error: " + String(e && e.message || e).slice(0, 80);
  }
}
__name(pushToGitHub, "pushToGitHub");
__name2(pushToGitHub, "pushToGitHub");
__name22(pushToGitHub, "pushToGitHub");
async function applyMeta(env, commit) {
  await ensureMetaSchema(env);
  const out = { applied: [], errors: [], commit };
  const claims = await env.QNFO_AUDIT.prepare(
    "SELECT * FROM meta_claims WHERE valid=1 AND status='validated' AND applied_at IS NULL ORDER BY created_at ASC LIMIT ?1"
  ).bind(MAX_APPLY_PER_RUN).all();
  const files = await listSkillFiles(env);
  const byName = new Map(files.map((f) => [f.skill, f]));
  for (const claim of claims.results || []) {
    try {
      const target = byName.get(String(claim.skill_target || "").toLowerCase());
      if (!target) {
        await env.QNFO_AUDIT.prepare("UPDATE meta_claims SET status='rejected', reason='skill not found: ' || ?1 WHERE id=?2").bind(String(claim.skill_target || ""), claim.id).run();
        out.applied.push({ id: claim.id, skill: claim.skill_target, applied: false, reason: "skill-not-found" });
        continue;
      }
      if (!commit) {
        out.applied.push({ id: claim.id, skill: claim.skill_target, preview: "would-apply" });
        continue;
      }
      const body = await readSkillBody(env, target.key);
      if (!body) {
        out.errors.push({ id: claim.id, error: "empty skill body" });
        continue;
      }
      if (body.includes(claim.gate_name)) {
        await env.QNFO_AUDIT.prepare("UPDATE meta_claims SET status='applied', reason='already present (gate name found)', applied_at=?1 WHERE id=?2").bind((/* @__PURE__ */ new Date()).toISOString(), claim.id).run();
        out.applied.push({ id: claim.id, skill: claim.skill_target, applied: false, reason: "gate-already-present" });
        continue;
      }
      const res = appendSection(env, body, claim);
      await env.SKILLS_BUCKET.put(target.key, res.body, { httpMetadata: { contentType: "text/markdown" } });
      const verify = await readSkillBody(env, target.key);
      const ok = verify.includes(claim.gate_name) && verify.includes(res.changeId);
      const chId = crypto.randomUUID();
      await env.QNFO_AUDIT.prepare(
        "INSERT INTO meta_changes (id, claim_id, intent_id, skill, key, section, git_push, created_at) VALUES (?1,?2,?3,?4,?5,?6,'pending',?7)"
      ).bind(chId, claim.id, claim.intent_id, target.skill, target.key, claim.gate_name, (/* @__PURE__ */ new Date()).toISOString()).run();
      const push = ok ? await pushToGitHub(env, target.key, res.body, "kaizen meta-loop: add " + claim.gate_name + " to " + target.skill + " (autonomous, change " + res.changeId + ")") : "skipped-verify-failed";
      await env.QNFO_AUDIT.prepare("UPDATE meta_changes SET git_push=?1 WHERE id=?2").bind(push, chId).run();
      await env.QNFO_AUDIT.prepare("UPDATE meta_claims SET status=?, reason='applied ok=' || ?2 || ' git=' || ?3, applied_at=?4 WHERE id=?5").bind(ok ? "applied" : "failed-verify", ok ? "1" : "0", push, (/* @__PURE__ */ new Date()).toISOString(), claim.id).run();
      try {
        await env.QNFO_AUDIT.prepare("INSERT INTO kaizen_reports (id, session_id, report_date, findings, improvements_applied, wbs_code) VALUES (?,?,?,?,?,?)").bind(
          "kaizen-meta-" + Date.now(),
          "qnfo-kaizen-meta",
          (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
          "Meta loop applied gate " + claim.gate_name + " to " + target.skill + " (change " + res.changeId + ", git=" + push + "). Claim: " + String(claim.claim || "").slice(0, 200),
          JSON.stringify({ gate: claim.gate_name, skill: target.skill, intent: claim.intent_id, verified: ok }),
          "QNFO.INF.KAIZEN.META"
        ).run();
      } catch (e) {
      }
      out.applied.push({ id: claim.id, skill: target.skill, gate: claim.gate_name, applied: ok, verified: ok, git: push });
    } catch (e) {
      out.errors.push({ id: claim.id, error: e && e.message ? e.message : String(e) });
    }
  }
  return out;
}
__name(applyMeta, "applyMeta");
__name2(applyMeta, "applyMeta");
__name22(applyMeta, "applyMeta");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
    try {
      if (p === "/health") {
        return json({
          status: "ok",
          worker: "qnfo-kaizen",
          version: VERSION,
          bindings: { r2: !!env.SKILLS_BUCKET, d1: !!env.QNFO_AUDIT, ai: !!env.AI },
          secrets: { kaizen_token: !!env.KAIZEN_TOKEN, github_token: !!env.GITHUB_TOKEN },
          crons: ["0 2 * * * (meta loop)", "0 10 * * 1 (drift scan)"],
          policy: { maxApplyPerRun: MAX_APPLY_PER_RUN, maxClaimPerRun: MAX_CLAIM_PER_RUN, versionBump: false, additiveOnly: true, githubPush: !!env.GITHUB_TOKEN }
        });
      }
      if (p === "/run/scan") {
        return json(await runScan(env));
      }
      if (p === "/run/meta") {
        const commit = url.searchParams.get("commit") === "1";
        if (commit && !auth(request, env)) return json({ error: "unauthorized" }, 401);
        const limit = Math.min(parseInt(url.searchParams.get("limit") || String(MAX_CLAIM_PER_RUN), 10) || MAX_CLAIM_PER_RUN, 50);
        return json(await runMeta(env, commit, limit));
      }
      if (p === "/run/apply") {
        const commit = url.searchParams.get("commit") === "1";
        if (commit && !auth(request, env)) return json({ error: "unauthorized" }, 401);
        return json(await applyMeta(env, commit));
      }
      if (p === "/test/ai") {
        const t = url.searchParams.get("text") || "reply with the word ok";
        try {
          const model = url.searchParams.get("model") || "@cf/zai-org/glm-5.2";
          const r = await env.AI.run(model, { messages: [{ role: "user", content: t }], max_tokens: 2500, temperature: 0.2 });
          const t2 = r && r.choices && r.choices[0] && r.choices[0].message ? String(r.choices[0].message.content || r.choices[0].message.reasoning_content || "") : String(r && (r.response || r.result) || "");
          return json({ raw: t2.slice(0, 2500), keys: Object.keys(r || {}), shape: r && r.choices ? "openai" : "workers-ai" });
        } catch (e) {
          return json({ error: "ai-error: " + (e && e.message ? e.message : String(e)).slice(0, 300) });
        }
      }
      if (p === "/claims") {
        const rows = await env.QNFO_AUDIT.prepare("SELECT id, skill_target, gate_name, claim, confidence, status, applied_at FROM meta_claims ORDER BY created_at DESC LIMIT 20").all();
        return json({ claims: rows.results });
      }
      return json({ error: "not found", path: p }, 404);
    } catch (e) {
      return json({ error: "server error: " + (e && e.message ? e.message : String(e)) }, 500);
    }
  },
  async scheduled(event, env) {
    console.log("[qnfo-kaizen v" + VERSION + "] cron:", event.cron);
    try {
      if (event.cron === "0 2 * * *") {
        await ensureMetaSchema(env);
        const m = await runMeta(env, true, MAX_CLAIM_PER_RUN);
        const a = await applyMeta(env, true);
        console.log("[qnfo-kaizen] meta loop:", JSON.stringify({ claimed: m.claimed.length, errors: m.errors.length, applied: a.applied.length }));
      } else if (event.cron === "0 10 * * 1") {
        const r = await runScan(env);
        console.log("[qnfo-kaizen] scan done:", JSON.stringify({ scanned: r.scanned, flagged: r.flagged }));
      }
    } catch (e) {
      console.error("[qnfo-kaizen] cron error:", e && e.message ? e.message : String(e));
    }
  }
};
export {
  worker_default as default
};