# qnfo-subscribers

Email capture + weekly research digest for qnfo.org.

- POST /subscribe {email,hp,source} -> stores in qnfo-audit.subscribers, sends a confirmation email.
- GET /unsubscribe?token=... -> flips status='unsubscribed'.
- POST /run/digest (Bearer SUBSCRIBERS_TOKEN) -> sends the digest on demand.
- Cron 0 16 * * 1 (Mon 16:00 UTC) -> weekly digest of papers published in the last 7 days.

The public form lives on qnfo.org; qnfo-gateway proxies /api/subscribe and
/api/unsubscribe here so the browser stays same-origin.
