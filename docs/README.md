# Quniverse documentation directory

This is the central discovery point for system documentation. Source stays
beside its owning component where appropriate; this directory links it rather
than creating competing copies. Charter pillar: **autonomy**.

**Every agent starts here:** [shared operating library](agent-library/README.md)
(`FLEET-SHARED-LIBRARY-1`), [llms.txt](../llms.txt),
[complete documentation index](INDEX.md), and
[machine-readable catalog with SHA-256 hashes](agent-catalog.json).
The inventory is generated, not a claim that historical proposals are live.
Private data and credentials do not belong in this public library.

## Read by task

| Task | Authoritative starting points |
|---|---|
| Session rules and safe execution | [CLAUDE.md](../CLAUDE.md), [AGENTS.md](../AGENTS.md), [doctrine](AUTONOMOUS-OPERATION-DOCTRINE.md), [kernel](DOCTRINE-KERNEL.md) |
| Mission, requirements and portfolio | [charter](QUNIVERSE-CHARTER.md), [strategy](STRATEGY.md), [PRD](QUNIVERSE-PRD.md), [portfolio](PORTFOLIO.md), [program work](client-instructions/PROACTIVE-PROGRAMS-1.md) |
| Provider selection and cost | [shared library](agent-library/README.md), [Cloudflare capabilities](CLOUDFLARE-CAPABILITY-INTEGRATION.md), [model routing](COST-OPTIMIZED-MODEL-CALLS.md), [fleet budget](FLEET-BUDGET.md), [value for money](VALUE-FOR-MONEY.md) |
| Research and publications | [pipeline](AUTONOMOUS-RESEARCH-PIPELINE.md), [authoring](PAPER-AUTHORING-GUIDELINES.md), [provenance](RESEARCH-PROVENANCE.md), [ensembles](ENSEMBLE-POLICY.md), [paper revisions](PAPER-LEDGER.md), [quality outcomes](OUTPUT-QUALITY-LEDGER.md) |
| Issues, verification and deployment | [session procedures](../CLAUDE.md), [fleet graph](FLEET-GRAPH.md), [worker standards](WORKERS-STANDARDS.md), [root-cause contracts](root-cause-contract/README.md), [SLA paths](SLA-AND-PATHS-1.md), [gradual deploys](GRADUAL-DEPLOYS.md) |
| Agent/client discovery and tools | [GitHub cloud access](GITHUB-CLOUD-QUNIVERSE.md), [client adapters](client-instructions/README.md), [machine readability](../machine-readability/README.md), [tools MCP](../qnfo-tools-mcp/README.md) |
| Architecture and data boundaries | [self-model](ARCHITECTURE-SELF-MODEL.md), [domains](DOMAINS.md), [retention](RETENTION.md), [processing activities](ROPA.md), [repository map](REPO-MAP.md) |

## Authority, freshness and maintenance

The shared library supplements, never supersedes, `CLAUDE.md` and the
charter/doctrine precedence rules. A dated audit, design or closeout is
historical evidence, not proof of present deployment or access. Generated
live blocks retain their existing owning loop; never edit them by hand.
Read current code, live graph, entitlements and probes for present behavior.

The catalog indexes tracked system Markdown, root instruction/LLM entry
points, audits, component subdirectory documentation and machine-readability
documentation. It excludes paper bodies, archives, funding proposals, test
fixtures, arbitrary data and local/private client settings.
Catalog `sha256` values cover the shared library, this directory and the
LLM bootstrap, not policy approval. Other documents rely on the pinned Git
revision, so live-generated charter/portfolio updates do not invalidate a
library release. Retrieve a single GitHub commit consistently before
checking hashes; `main` URLs are discovery conveniences and may change
between requests.

Stage new source files before generating: the inventory uses `git ls-files`
and never publishes untracked local files. Regenerate with
`node scripts/build-agent-catalog.mjs`; verify without writes
with `node scripts/build-agent-catalog.mjs --check`. Generated index/catalog
files are outputs, not additional authored sources. New clients load
`llms.txt` and the shared library; external/local settings and deployed
runtime consumers still need their own verified adoption.
