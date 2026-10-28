# Client instruction suite (2026-10-28)

One core block, `PROACTIVE-PROGRAMS-1.md`, goes into every client below. Each client keeps its existing instructions; the block is appended, nothing is replaced.

| Client | Existing instructions found (read 2026-10-28) | Where the block goes | State |
|---|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` (global), repo `CLAUDE.md` (project) | appended to the global file (backup `CLAUDE.md.bak-20261028`); the repo file reaches it through `AGENTS.md` and this directory | applied |
| GitHub cloud agent / Copilot | `.github/agents/quniverse.agent.md`, `AGENTS.md` (no `copilot-instructions.md` existed) | new `.github/copilot-instructions.md` (existing text kept, block appended); one pointer line in the agent file and `AGENTS.md` | in working tree, not committed |
| DeepChat | `~/.deepchat/system-prompt-v2.7.md` and its mirror `app-settings.json` `default_system_prompt` (v4.61, 74 KB); `custom_prompts.json` | inserted before `## DOMAIN MODULES`, retitled v4.62 (script `~/.deepchat/scripts/apply-proactive-programs-v4.62.py`, backup in `~/.deepchat/backups/proactive-*`) | applied; prompt-store-verify and prompt-parity-guard pass |
| Chatbox | `config.json` `settings.defaultPrompt` in `%APPDATA%\xyz.chatboxapp.app` (26 KB, ends with the 2026-10-17 owner directives) | appended to `chatbox-doctrine-prompt-canonical.txt` (4 mirrors) and healed into the live store by chatbox-prompt-guard | applied; takes effect at next Chatbox start |

The block also carries the standing yes (owner, 2026-10-28): in-scope reversible questions are answered yes and executed, inside the interrupt gate and the harness checks.
