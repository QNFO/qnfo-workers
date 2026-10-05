# qnfo-subscribers

Email capture + weekly research digest for qnfo.org.

- POST /subscribe {email,hp,source} -> stores in qnfo-audit.subscribers, sends a confirmation email.
- GET /confirm?token=... -> a page with one "Confirm subscription" button; only its POST sets status='subscribed'
  (1.1.7, #1904: mail link scanners fetch every link, so a GET must never confirm).
- GET or POST /unsubscribe?token=... -> flips status='unsubscribed' (the digest's List-Unsubscribe one-click POST lands here).
- Every send writes a cloud_ops_events row (kind 'subscribers-send', domain only, messageId or error); confirm page views and
  confirmations write kind 'subscribers-confirm' (1.1.7, #1905).
- POST /run/digest (Bearer SUBSCRIBERS_TOKEN) -> sends the digest on demand.
- Cron 0 16 * * 1 (Cloudflare day 1 = Sunday, so Sun 16:00 UTC) -> weekly digest of papers published in the last 7 days.

The public form lives on qnfo.org; qnfo-gateway proxies /api/subscribe and
/api/unsubscribe here so the browser stays same-origin.
