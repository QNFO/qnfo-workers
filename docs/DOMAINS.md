# Which domain a surface lives on (DOMAIN-PLANE-1)

Owner directive, 2026-10-19 (verbatim): "all of this needs to be, routed through a subdomain. So for personal shit, use q08.org.
For research shit, use qnfo.org. Or for, in particular, stuff that's quantum computing, use qwave.org. ... Make this consumer
friendly. I'm the end user. I'm the consumer. Make it friendly and easy for me to remember."

| Plane | Domain | Examples |
|---|---|---|
| Personal (the owner's own life, the personal plane) | `q08.org` | `me.q08.org` (the companion: personal-api), `reading.q08.org` (personal-companion) |
| Research, the fleet and QNFO's public work | `qnfo.org` | `fleet.qnfo.org`, `archive.qnfo.org`, `ops.qnfo.org` |
| Quantum computing | `qwav.org` | `qwav.org`, `ask.qwav.org` |

The owner wrote "qwave.org"; the zone in the account is `qwav.org` (with `qwav.tech`), so quantum-computing surfaces use `qwav.org`.

Rules for every loop and session:
- A surface a person opens or types (a page, an app, an address in an e-mail) is on its plane's domain, on a short name a person
  can remember. A `*.workers.dev` host is an origin for machines and probes, never the address given to the owner.
- Personal surfaces never sit on `qnfo.org` or `qwav.org`, and research surfaces never on `q08.org` (the personal/research
  separation holds for addresses too). Mail about personal matters is sent from a `q08.org` sender where the zone allows it.
- The owner signs in with an e-mailed one-time code, never a key or token (OPEN-ACCESS-1, COMPANION-LOGIN-1). Keys stay for tools.
- A new host is attached through the repository token (zone route plus a proxied record, the pattern in
  `scripts/attach-me-q08-route.py` and `scripts/attach-surface-routes.py`) and verified from outside the account.
- A surface found on the wrong domain gets a `DOMAIN-PLANE-1:<host>` issue in `agent_issues`; it is moved by the loop or PR that
  owns the worker, keeping the old host as a redirect so links already sent keep working.
