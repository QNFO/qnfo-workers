-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM session_records WHERE session_id = 'session-yt-quality-1028'; DELETE FROM roadmap_implementation WHERE source = 'yt-shorts-2026' AND item IN ('YT-14');
-- SESSION-CLOSEOUT-20261028-YT (pillar reach; SESSION-RECORD-1, OWNER-NO-LOOSE-ENDS-1): the Shorts quality pass, the LLM director and the port into the production worker.
INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence)
SELECT 'YT-14', 'yt-shorts-2026', 'Production worker quality pass: Aura 2 voice, new templates and director rules, fitted themed scene, measured captions, AI provenance (qnfo-youtube-shorts 0.2.0)', 'worker', 'qnfo-youtube-shorts', 'built',
       'merged to main triggers deploy-youtube-shorts.yml; verify GET /status version 0.2.0-quality and the next uploaded row beats.json kinds >= 4'
WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'YT-14' AND source = 'yt-shorts-2026');
INSERT INTO session_records (
  session_id, wbs_code, agent_name, summary, decisions_made, files_changed,
  commits, infrastructure_changes, handoff_notes, execution_ratio,
  total_tasks, completed_tasks, started_at, completed_at, created_at
)
SELECT
  'session-yt-quality-1028', 'QNFO.REACH', 'claude-code',
  'Asked: fix YouTube Short text bleeding off screen, robotic voice and identical template, research best practice, then build and deploy everything server-side. Did: fitted all scene text to a safe width and measured captions in the real font (laptop scripts and production container); multilingual neural voice and speech-written scripts locally, Workers AI Aura 2 in the worker; five themes and four new templates; LLM director with number gate, fact-check and length gate; survey of open-source video generators; roadmap rows YT-7..14; machine-readable AI marking. Two Shorts rendered and inspected frame by frame on the laptop.',
  'Deterministic Manim diagrams stay the core because diffusion video cannot draw correct numbers; generative hooks parked behind retention data. Director fails closed when the fact-checker reply is unusable. Aura 2 primary with melotts fallback so a run never stops on the voice. Container scene keeps the old points and stat kinds for director files written before.',
  'scripts/youtube_poc (make_short, short_scene, make_director, tests, directors), qnfo-youtube-shorts (worker.js 0.2.0 and mirror, container/render.py, container/short_scene.py, tests), docs/YOUTUBE-PIPELINE.md, two migrations.',
  'PRs 5086 (merged), 5096 (merged), 5101 (open when this was written).',
  'qnfo-youtube-shorts 0.2.0-quality deploys through deploy-youtube-shorts.yml on merge.',
  'OPEN: (1) nobody has listened to the Aura 2 voice or the laptop voice; the owner or a listening test decides (YT-9). (2) The production render of the new scene has not run in the Cloudflare Container yet; the laptop render used the same scene with Segoe UI. Verify after deploy via /status and the next row. (3) YT-10 vertical centring and more templates, YT-11 render speed (about 9 minutes per 60 s on a laptop), YT-12 generative hooks after retention data, YT-13 C2PA embedding. (4) #5100 deploy-gate red is qnfo-research-exec suites, not this work. (5) YouTube forces private uploads until the API audit form is filed by the owner.',
  0.85, 9, 7,
  '2026-10-28T08:00:00Z', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE NOT EXISTS (SELECT 1 FROM session_records WHERE session_id = 'session-yt-quality-1028');
