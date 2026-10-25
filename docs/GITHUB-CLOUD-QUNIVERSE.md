# GitHub cloud access to Quniverse

Charter pillar: **autonomy**. GitHub cloud sessions are engineering clients,
not fleet runtime dependencies. Existing Cloudflare loops remain responsible
for recurring work.

## Two independent failures

The GitHub API read on 2026-10-25 confirmed that `QNFO/qnfo-workers` is
**public**, `is_automations_enabled` is already `true`, and repository
`mcp_configuration` was `null`. The repository had no Agents secrets.

GitHub's scheduled/event-driven **cloud automations require a private or
internal repository**. A public repository can use manually initiated cloud
agent sessions, but changing a YAML file or enabling remote control does not
make it eligible for cloud automations. Do not change repository visibility
as an implicit setup step. GitHub's automation eligibility and the app's
failure to load repository MCP settings are separate concerns; an empty MCP
configuration does not prove why the app's request failed.

## Headless Cloudflare access

Select the **Quniverse** custom agent when starting a cloud session. Its
versioned profile is `.github/agents/quniverse.agent.md`. Merge the profile
and setup workflow into the default branch before relying on discovery.
The setup workflow supplies the same Node 22 and Python 3.11 versions used
by repository CI, without exporting deployment credentials.

The profile connects directly to `https://mcp.cloudflare.com/mcp` using
Streamable HTTP and an existing Cloudflare API token. It exposes the
`search`, `execute`, and `docs` tools rather than a desktop-only OAuth
portal or documentation-only connector. Cloudflare supports bearer tokens
for this endpoint; GitHub cloud agent does not support remote MCP OAuth.

The repository's **Agents** secret
`COPILOT_MCP_CLOUDFLARE_API_TOKEN` must contain the existing authorized
Cloudflare API token. Configure it under **Settings > Secrets and variables
> Agents**, not Actions or Codespaces. `COPILOT_MCP_` secrets are supplied
only to MCP servers, not to the agent's shell. Do not commit a value, request
a new token, or copy a Worker's router key. GitHub cannot return the value
of an existing encrypted Actions secret.

The profile is specific to the selected custom agent. It does not populate
the shared repository MCP configuration or repair an app-side request to
load that configuration. To make the same tools available to the default
cloud agent, merge this entry with any existing configuration under
**Settings > Copilot > MCP servers**:

```json
{
  "mcpServers": {
    "cloudflare-api": {
      "type": "http",
      "url": "https://mcp.cloudflare.com/mcp",
      "tools": ["search", "execute", "docs"],
      "headers": {
        "Authorization": "Bearer $COPILOT_MCP_CLOUDFLARE_API_TOKEN"
      }
    }
  }
}
```

This grants API operations within the existing token's scope, not unlimited
authority. Worker deployment still uses the canonical workflow, migrations
still run through CI, and work claims and secret leases still apply.
Do not disable workflow approval or the firewall to make a probe pass.
If a shell-based fleet read is refused by the firewall, a repository
administrator can allow the specific required hostname in cloud-agent
settings; record and re-test the exact refusal.

## Verification

In a cloud session using **Quniverse**, confirm startup lists
`cloudflare-api/search`, `cloudflare-api/execute`, and
`cloudflare-api/docs`. Use `execute` with this read-only code:

```javascript
async () => {
  const response = await cloudflare.request({
    method: "GET",
    path: "/accounts"
  });
  return {
    success: response.success,
    accounts: response.result.map(({ id, name }) => ({ id, name }))
  };
}
```

Confirm the returned account is `quniverse`. Discover the endpoint needed
for the task with `search`, then verify a relevant resource read using the
explicit account ID. A tool listing or account read does not establish
permission to write every Cloudflare product. Validate intended mutations
through the normal fleet path and re-read the changed resource afterward.

The initial integration probe returned HTTP 200, listed the API tools, and
successfully read the `quniverse` account, its Workers list, and its D1
database list using the existing credential. The MCP-only Agents secret
was provisioned on 2026-10-25 and its presence re-read through GitHub's API.
Those probes were run from the engineering session, not a GitHub cloud-agent
session, so they do not establish cloud startup or firewall success.

For diagnosis, this documented read reports the live repository settings:

```sh
gh api repos/QNFO/qnfo-workers/copilot/cloud-agent/configuration
gh secret list --app agents --repo QNFO/qnfo-workers
```

Do not report the automation error fixed while the repository is public, or
cloud control verified until the selected cloud agent has performed the
resource read successfully.

## References

- [GitHub automation availability](https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/about-automations)
- [GitHub MCP configuration](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers)
- [GitHub Agents secrets](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/configure-secrets-and-variables)
- [Custom agent configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [Cloudflare API MCP authentication](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)
