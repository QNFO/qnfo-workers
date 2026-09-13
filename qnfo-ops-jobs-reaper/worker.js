// qnfo-ops-jobs-reaper — D17 + D19 remediation as a STANDALONE worker
//
// Why this exists: the canonical fix belongs in qnfo-ops/worker.js, but that file is
// 161,339 B and cannot be round-tripped through the GitHub contents API from the
// qnfo-ops endpoint (32,768-char read cap + full-content write requirement). This
// worker is small enough to deploy immediately and closes D17/D19 without touching it.
//
// Deploy:
//   cd qnfo-workers/qnfo-ops-jobs-reaper
//   wrangler deploy        # needs the D1 binding below
//
// wrangler.toml:
//   name = "qnfo-ops-jobs-reaper"
//   main = "worker.js"
//   compatibility_date = "2026-09-09"
//   [triggers]
//   crons = ["*/5 * * * *"]
//   [[d1_databases]]
//   binding = "QNFO_AUDIT"
//   database_name = "qnfo-audit"
//   database_id = "<same id as qnfo-ops>"

const VERSION = "1.0.0";
const WORKER = "qnfo-ops-jobs-reaper";

// Thresholds in MINUTES. See the WARNING below before lowering these.
const PROMOTE_AFTER_MIN = 45; // response present, no update for this long -> succeeded
const DEAD_AFTER_MIN = 90;    // no response at all for this long -> failed, WITH a reason

// ############################################################################
// # WARNING — READ BEFORE CHANGING PROMOTE_AFTER_MIN / DEAD_AFTER_MIN
// #
// # `ops_jobs.updated_at` is NOT a heartbeat. It is written only at a state
// # transition, so a job that is genuinely still working has an updated_at equal
// # to its creation time. A short threshold therefore REAPS LIVE JOBS: a job that
// # legitimately runs 50 minutes looks identical to one abandoned 50 minutes ago.
// #
// # The thresholds above are set high precisely because of this. The real fix is a
// # `heartbeat_at` column written once per tool round by the runner, after which
// # these can safely drop to ~5 min. Until that column exists, ANY threshold is a
// # guess and this worker is a mitigation, not a correction.
// ############################################################################

function json(data, status) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status || 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// terminal_at is additive; create it if this reaper runs before the DDL patch.
async function ensureTerminalAt(env) {
  const row = await env.QNFO_AUDIT.prepare(
    `SELECT COUNT(*) AS n FROM pragma_table_info('ops_jobs') WHERE name = 'terminal_at'`
  ).first();
  if (!row || row.n === 0) {
    await env.QNFO_AUDIT.prepare(`ALTER TABLE ops_jobs ADD COLUMN terminal_at TEXT`).run();
    return true;
  }
  return false;
}

// julianday() is used instead of string comparison because ops_jobs.updated_at is
// ISO-8601 with 'T' and 'Z', which does NOT sort correctly against SQLite's
// 'YYYY-MM-DD HH:MM:SS' format. julianday() also fails closed (NULL) on the integer
// epoch values that some other tables in this D1 use.
const STALE_PREDICATE = `
  julianday(updated_at) IS NOT NULL
  AND julianday(updated_at) < julianday('now') - (? / 1440.0)`;

async function reap(env, dryRun) {
  const now = new Date().toISOString();
  const addedTerminalAt = dryRun ? false : await ensureTerminalAt(env);

  const promoteWhere = `status IN ('running','continuing')
      AND response IS NOT NULL AND length(response) > 0
      AND ${STALE_PREDICATE}`;
  const deadWhere = `status IN ('running','continuing')
      AND (response IS NULL OR length(response) = 0)
      AND ${STALE_PREDICATE}`;

  if (dryRun) {
    const p = await env.QNFO_AUDIT.prepare(
      `SELECT COUNT(*) AS n FROM ops_jobs WHERE ${promoteWhere}`
    ).bind(PROMOTE_AFTER_MIN).first();
    const d = await env.QNFO_AUDIT.prepare(
      `SELECT COUNT(*) AS n FROM ops_jobs WHERE ${deadWhere}`
    ).bind(DEAD_AFTER_MIN).first();
    return { dryRun: true, wouldPromote: p?.n ?? 0, wouldFail: d?.n ?? 0,
             promoteAfterMin: PROMOTE_AFTER_MIN, deadAfterMin: DEAD_AFTER_MIN };
  }

  // D17: response was written, terminal status never was.
  const promoted = await env.QNFO_AUDIT.prepare(
    `UPDATE ops_jobs
        SET status='succeeded',
            terminal_at=COALESCE(terminal_at, updated_at),
            updated_at=?
      WHERE ${promoteWhere}`
  ).bind(now, PROMOTE_AFTER_MIN).run();

  // D19: no response and no recorded reason. The reason written here is
  // reaper-INFERRED, not the true cause — the true cause was never captured,
  // which is the defect. The text says so, so the row is not mistaken for a diagnosis.
  const dead = await env.QNFO_AUDIT.prepare(
    `UPDATE ops_jobs
        SET status='failed',
            error=COALESCE(error, ?),
            terminal_at=COALESCE(terminal_at, ?),
            updated_at=?
      WHERE ${deadWhere}`
  ).bind(
    `reaper: terminal with no response after ${DEAD_AFTER_MIN}m — true cause not captured (D19)`,
    now, now, DEAD_AFTER_MIN
  ).run();

  const out = {
    ok: true, worker: WORKER, version: VERSION, ts: now,
    addedTerminalAt,
    promoted: promoted?.meta?.changes ?? null,
    failed: dead?.meta?.changes ?? null,
    promoteAfterMin: PROMOTE_AFTER_MIN,
    deadAfterMin: DEAD_AFTER_MIN,
  };

  await env.QNFO_AUDIT.prepare(
    `INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status)
     VALUES (?, ?, 'jobs-reaper', ?, ?, ?, 'ok')`
  ).bind(
    `reap-${Date.now()}`, now, "jobs reaper cycle",
    JSON.stringify({ promoted: out.promoted, failed: out.failed }), WORKER
  ).run().catch(() => {});

  return out;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return json({ ok: true, worker: WORKER, version: VERSION,
                    promoteAfterMin: PROMOTE_AFTER_MIN, deadAfterMin: DEAD_AFTER_MIN });
    }
    if (url.pathname === "/reap") {
      try {
        return json(await reap(env, url.searchParams.get("dry") === "1"));
      } catch (e) {
        return json({ ok: false, error: `${e?.name}: ${e?.message}` }, 500);
      }
    }
    return json({ ok: false, error: "not found", routes: ["/health", "/reap", "/reap?dry=1"] }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(reap(env, false).catch(() => {}));
  },
};
