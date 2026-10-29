# QNFO OPS SELF-DOCUMENTATION — Master Index (2026-09-01)
> Purpose: one durable, canonical pointer for EVERYTHING the QNFO fleet owns: resources, tools,
> policies, procedures, practices, protocols, processes. Auto-audited weekly by the Fleet Drift
> cron (42b1988c). Companion to docs/FLEET-MANIFEST.md (48-worker inventory).

## 1. Repositories (git origin = durable truth; THIN-CLIENT mandate)
| Repo | Remote | Holds |
|---|---|---|
| qnfo-workers | github.com/QNFO/qnfo-workers | worker bundles (qnfo-ai worker-*.js + deployed-current.worker.js + wrangler.toml; idea-factory; cloud-ops) |
| qnfo-ops | github.com/QNFO/qnfo-ops | cloud worker sources (qnfo-infra/cloud/...), docs/, scripts/ (fleet sweep, calendar-sync, backups, prompt-store tools) |
| qnfo-skills | github.com/QNFO/qnfo-skills | 40 skills + system-prompt-v2.7.md + prompt-stores/customPrompts.json (12 CMD templates) |
| wbs-6-synthesis | github.com/QNFO/wbs-6-synthesis | docs/WBS.TAXONOMY.md (WBS codes) + docs/WBS-AGENT-PROTOCOL.md |

## 2. Cloudflare Workers (canonical count + versions = auto-generated FLEET-MANIFEST.md)
Self-doc policy FLEET-SELF-DOC-1: every worker carries VERSION + /health + canonical repo bundle.
As of 2026-09-03 sweep v2.0: 58 workers, OK 28, DRIFT 3, GAP/PARTIAL 27 (self-contained enumeration,
no hand-editing). Full per-worker table: docs/FLEET-MANIFEST.md (regenerated weekly + on demand).

## 3. Data stores
### D1 databases (8)
| DB | Purpose |
|---|---|
| qnfo-audit | audit + handoffs + wbs_state + ai_queries + chat + worker_invocations + emails (canonical audit) |
| living-paper | papers (body_md, doi, slug) — canonical research corpus |
| portfolio-state | program_registry + states |
| qnfo-graph | knowledge graph nodes/edges |
| personal-life | personal plane (PERSONAL-QNFO-SEPARATION-1) |
| qnfo-outreach / qnfo-cms / ipatent-db | outreach, CMS, ipatent |
### R2 buckets (15; qnfo DEPRECATED, qnfo-audit = audit, qnfo-releases = papers, qnfo-backups = backups)
d-drive, deepchat, git-repos, ipatent, obsidian-vault, palimpsest-research, play-the-ball,
qnfo(DEPRECATED), qnfo-assets, qnfo-audit, qnfo-backups, qnfo-projects, qnfo-releases, qnfo-skills, releases(anti-pattern)
### Vectorize indexes (9)
qwav-research-v2 (papers), qnfo-notes, qnfo-tasks, qnfo-handoffs, qnfo-infra, qnfo-cloud-ops,
ipatent-corpus, qnfo-ai-log + personal-plane indexes (separate per separation mandate)
### KV (1): equation-cache

## 4. DeepChat scheduled jobs (24 registered 2026-09-01)
Key jobs: Fleet Drift Audit 42b1988c (weekly, self-repair), Data Freshness Sync aa67d355 (6h,
calendar+email→Vectorize), AI Worker Health + Provider Config Guard d5e1e85e (3h), Daily System
Verification 20157001 (checks prompt-store #6), skills-autonomous-sync 290f26b4.
KNOWN: 23/24 have targetCount=0 (DEAD-NOTIFY-CHAIN-1 — user must configure a delivery channel).

## 5. Skills (40, synced from qnfo-skills; version parity enforced)
research v2.147, kaizen v2.122 (kaizen = CMD SKILLS UPDATE engine), cloudflare v3.70,
execution-mandate v2.13, qnfo-core v1.40, system v2.15, deepchat-settings v1.26, email-composer,
bloat-cleanup, skill-pull + 32 more. Skill registry gap (SKILL-REGISTRY-GAP-1): read via read tool.

## 6. Prompt stores + templates
- System prompt v3.97 — 5 stores byte-identical (canonical .deepchat/system-prompt-v2.7.md,
  Roaming app-settings.json default_system_prompt, Roaming agent.db systemPrompts[0].content,
  agents.deepchat config_json.systemPrompt, qnfo-skills repo copy) — verified by prompt-store-verify.py
- CMD templates 12/12 — schema-gated (customPrompts.json canonical + 4 live stores)
- prompt-store-verify.py (exit 0 gate) + restore_custom_prompts.py (schema-gated restorer)

## 7. Policies / procedures / protocols / practices (WHERE each class of rule lives)
| Class | Canonical home |
|---|---|
| Hard gates (MANDATORY xx-1 rules) | system prompt v3.97 MANDATORY blocks (preservation chain v3.49→v3.97) |
| Kaizen mirror rows | kaizen/SKILL.md v2.122 (session lessons → named gates) |
| Domain procedures | research / cloudflare / qnfo-core / system / execution-mandate skills |
| WBS codes + plan protocol | wbs-6-synthesis docs/WBS.TAXONOMY.md + WBS-AGENT-PROTOCOL.md |
| Cost control | cloudflare skill ($90/30d spend, COST-AUDIT-MISS-AI-1, CMD DEPLOY gate) |
| Self-doc policy | FLEET-SELF-DOC-1 (this doc + FLEET-MANIFEST.md) |
| Deploy procedures | WRANGLER-API-PUT-NOOP-1 (wrangler = truth for bundle workers), DEPLOY-VERIFY-VERSION-1, BINDING-PRESERVATION-1 |
| RAG/freshness | RESEARCH-INTENT-RAG-1 (5.11.0/1.5.0), CALENDAR-SYNC-GAP-CLOSED, freshness cron aa67d355 |
| Parity/verify tools | scripts/prompt-store-verify.py, scripts/fleet-manifest-sweep.py, scripts/calendar-sync.py |

## 8. Tools/scripts inventory (C:/Users/LENOVO/.deepchat/scripts/)
prompt-store-verify.py, restore_custom_prompts.py, skill_pull.py, fleet-manifest-sweep.py,
calendar-sync.py, backup_deepchat.py, dr_validate_schema.py + watchdog/relaunch utilities.

## 9. How the fleet self-improves (no manual intervention)
1. Weekly drift audit (42b1988c) — version drift + gaps detected/repaired from canonical repos.
2. 3h health guard (d5e1e85e) — probes chat paths + provider config.
3. 6h freshness sync (aa67d355) — calendar + email → Vectorize.
4. Kaizen cycles — every session lesson → named gate → dual-written (skills + system prompt + CMD).
5. OPEN: Cloudflare-side scheduler for host-independent audits (owner: next infra session).
