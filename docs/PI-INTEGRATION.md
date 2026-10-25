# Pi integration

Pi is available as a repository engineering harness. When Pi starts from this
repository, its project-context discovery loads the root `AGENTS.md`, applying
the QNFO-specific repository and fleet rules to work in every worker directory.
Pi remains an external development tool; the repository and Cloudflare D1/R2
stores remain the durable sources of truth.

## Runtime boundary

Pi's coding-agent SDK is designed for Node.js or Bun. Cloudflare Workers use a
different runtime, so importing Pi into deployed Workers would add an
unsupported runtime dependency. This integration therefore does not add Pi to
Worker bundles, deploy a new service or container, create bindings or secrets,
or change any fleet execution path.

Fleet agent loops continue to use the existing Cloudflare-native architecture:
Workers AI and `qnfo-ai` for model routing, the established MCP and service
bindings for tools, and the existing D1-backed orchestration for durable work.
Workers calling `qnfo-ai` use service-binding caller properties, not copied
router credentials.

## Using Pi in this repository

From the repository root, start Pi so it discovers `AGENTS.md`:

```sh
pi
```

Pi supplies the coding interface; `AGENTS.md`, `CLAUDE.md`, the charter, and
the doctrine documents supply the repository-specific operating context. No
provider key, MCP token, or other secret is stored in this repository.

## Scope

This integration makes Pi-aware repository work consistent across the fleet's
codebase. It does not install Pi on Cloudflare, change how deployed agents run,
or imply that Pi can access QNFO tools or model endpoints without their
existing authentication and authorization paths.
