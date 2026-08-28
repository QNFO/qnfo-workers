# Chatbox (Windows) — Full QNFO Setup

Chatbox 1.22.6 is installed at `C:\Program Files\Chatbox\Chatbox.exe` (winget: Bin-Huang.Chatbox).
This page wires it to the Cloudflare stack: two OpenAI-compatible providers, two MCP servers,
and the QNFO prompt library. Everything below runs off Cloudflare — Chatbox is only the UI
(its local app data holds UI config and chat history, nothing project-critical).

## 1. Providers (Settings -> Settings -> Model Providers -> Add)

### QNFO Router (research)
- Provider type: **OpenAI API compatible**
- Name: `QNFO Router`
- API Host: `https://qnfo-ai.q08.workers.dev`
- API Path: `/v1/chat/completions` (default)
- API Key: the research key (`C:/Users/LENOVO/tokens/qnfo-ai`)
- Model: `glm-5.2` (free, reasoning) — others available: `auto`, `deepseek-v4-flash`,
  `deepseek-v4-flash-thinking`, `deepseek-r1-qwen-32b`, `qwq-32b`, `kimi-k2.6`, `ensemble`.

### Personal Twin (personal)
- Provider type: **OpenAI API compatible**
- Name: `Personal Twin`
- API Host: `https://personal-api.q08.workers.dev`
- API Path: `/v1/chat/completions` (default)
- API Key: the personal key (`C:/Users/LENOVO/tokens/personal-api`)
- Model: `personal-twin-chat`

Both support streaming (v4.6.3+ / v1.3.0+), so the model test will pass and answers stream.

## 2. MCP servers (Settings -> MCP Servers -> Add)

Two Cloudflare-hosted MCP servers give Chatbox the agentic tools.

### qnfo-tools-mcp (web + research + personal recall) — new 2026-08-28
- Type: **HTTP (SSE)** — URL: `https://qnfo-tools-mcp.q08.workers.dev/mcp/sse?token=<research key>`
- If your Chatbox build only supports streamable HTTP: `https://qnfo-tools-mcp.q08.workers.dev/mcp?token=<research key>`
- Tools: `web_search`, `web_fetch` (SSRF-guarded), `papers_search` (QNFO corpus),
  `history_recall` (your past research notes), `personal_search` (personal-life index).
- Health: `https://qnfo-tools-mcp.q08.workers.dev/health`

### qnfo-memory-mcp (knowledge graph + memory)
- Type: **HTTP (SSE)** — URL: `https://qnfo-memory-mcp.q08.workers.dev/mcp/sse`
- Tools: `search_papers`, `search_papers_enriched`, `resolve_paper_id`, `search_memories`,
  `remember_fact`, `recall_facts`, `query_graph`, `get_paper_context`.
- Public (read-only; remember_fact writes to the QNFO memory store — it is the designed write path).

## 3. System prompt (make every chat agentic)

In Chatbox, open a chat with QNFO Router and set this as the conversation system prompt
(message row menu -> Set as system prompt, or paste at the top). One block, plain language:

```
You are the QNFO research agent for Rowan Brad Quni-Gudzinas. Mission: the energy-efficiency
benchmark for quantum computing (JPCUB - joules per correct, useful answer; grounded in Landauer,
Margolus-Levitin, Bremermann; anti-gaming discipline). Work across ultrametric physics, laws of
form, information physics, paradigm engineering, consilience research.

Working rules:
- Verify before asserting: any claim a computer can check gets checked in code first; cite evidence
  files for every count and DOI; audit before asserting; disclose AI involvement.
- Web + corpus: use the MCP tools (web_search, web_fetch, papers_search, history_recall,
  personal_search) before answering research questions; ground answers with sources.
- Notes: when the user jots ideas, respond briefly, keep the thread focused, and let the API's
  automatic logging capture the exchange (it is stored in Vectorize for future synthesis).
- Due diligence: full-corpus sweeps (3+ query formulations, >=2 adjacent domains), never top-k
  convenience; flag contradictions, don't hide them.
- Publications: plain scholarly prose for external readers; no internal pipeline vocabulary,
  no brand labels, no meta-commentary; every superseded record carries isObsoletedBy; verify every
  citation live; deposit all source files; run the runtime verifier after deploys.
- Naming: Rowan Brad Quni-Gudzinas (full name); QNFO (research) / QWAV (commercial) - never
  "Research Collective"; plain signatures.
- Segregation: research notes go to QNFO Router; personal notes go to Personal Twin; never mix.
```

## 4. Prompt library (reusable commands)

Chatbox keeps a prompt library per chat (the Prompt icon). Add these as saved prompts
(they mirror the DeepChat CMD templates):

- **NOTE** — "Jot this down and keep it brief: {topic}"
- **CMD RESEARCH** — full research cycle: Phase 0 context, due-diligence sweep, hypothesis cards,
  computational verification, publication with all source files, post-publication red team.
- **CMD PUBLISH** — publication checklist: source completeness, citation audit, versioned DOI,
  R2 mirror, KG/D1 re-point, runtime verifier.
- **CMD RED TEAM** — adversarial audit (accuracy/completeness/dependency) of the last artifact;
  read-only; every HARD finding becomes a fix item.
- **CMD SKILLS UPDATE** — kaizen cycle: root-cause every error to a mechanism, add a permanent
  gate, verify the gate, keep prompt stores byte-identical (7 stores), mirror rows.
- **CMD CLOSEOUT** — verify plan, evidence for every step, memory log, deferred items documented.

Full text for each lives in `QNFO/qnfo-workers/qnfo-ai/prompts-qnfo.md` (copy-paste).

## 5. What Chatbox does NOT have (and the Cloudflare-native path)

| DeepChat feature | Chatbox equivalent | Gap + Cloudflare path |
| --- | --- | --- |
| Custom OpenAI providers | yes (both providers) | none |
| Streaming, reasoning models | yes | none |
| MCP servers | yes (both MCP servers) | none |
| Prompts / CMD templates | prompt library + system prompt | partial - no parameter slots; use {placeholders} manually |
| Skills (SKILL.md files) | none | approximated by system prompt + prompt library + MCP tools; authoritative skills stay in git (qnfo-skills) |
| Subagents / orchestration | none | use qnfo-tools-mcp tools directly; heavier orchestration -> Cloudflare Agents SDK scheduled tasks (next step) |
| Scheduled tasks / cronjobs | none | Cloudflare Agents SDK scheduled tasks (Workers) - proposed next build |
| Session tapes / plan checklists | none | plan inline in the chat; logs live in Vectorize (history_recall tool) |
| Automatic logging | none needed | every API call is logged server-side regardless of client |

Thin-client compliance: Chatbox stores only UI config (providers, MCP URLs, keys, chat history)
in its app data. All project code, data, and logs live in git / R2 / D1 / Vectorize on Cloudflare.
Nothing project-critical is installed or stored locally beyond the UI itself.

## 6. Verify

```bash
curl -s https://qnfo-tools-mcp.q08.workers.dev/health
curl -s "https://qnfo-memory-mcp.q08.workers.dev/health"
python <repo>/qnfo-ai/scripts/verify-runtime.py   # 10/10 provider + logging proof
```
