// _shared/flow-registry.js: FLOW-DIRECTIVE-1 (Rowan, 2026-11-12). "How is this information flowing in? And what are we doing with it
// flowing out? And that applies to any workflow." Every workflow in the Qniverse fleet and in Ultrastable declares here what flows in, what
// flows out, through which bindings, and the feedback path by which its own outcomes come back as signals that change its next output.
//
// The registry is code, read by three consumers:
//   - _shared/flow-registry.test.mjs (CI): fails a Cloudflare Workflow or a cron worker with no declared flow, an inflow no flow produces,
//     an outflow no flow consumes, and a flow that is on no feedback cycle unless its open loop is a declared gap with a loop issue.
//   - personal-companion (hourly, inlined as namespace FR): publishes the registry to qnfo-audit flow_registry, checks it against the live
//     clocks (every clock_ticks loop must belong to a flow), settles adaptations (keep or roll back), and writes the flow metrics.
//   - personal-companion /pipelines and /api/flows: the live flow map, generated from this file.
//
// A signal is a typed name. A flow produces it on an outflow and another flow consumes it on an inflow. A signal that leaves the fleet
// (to an employer, a reader, a social graph, the owner) is an external outflow and must name the signal that comes back (`returns`), so
// the world is part of the loop, never a dead end. A signal that enters from outside is listed in EXTERNAL_SOURCES.
//
// Pure ESM, no imports: personal-companion inlines it (scripts/inline-pipeline-modules.mjs); tests load it directly.

export const FLOW_VERSION = "1.3.0";
export const DIRECTIVE_ID = "FLOW-DIRECTIVE-1";
export const DIRECTIVE = "Every workflow, in every product (Ultrastable, the Qniverse, jobs, outreach, resume, personal, research), declares its inflows, " +
  "outflows and bindings, and feeds its outcomes back through the signals engine so results change the next outputs. Each flow is a loop and is accounted for in code.";

export const SCOPES = ["qniverse", "personal", "ultrastable"];
export const BINDING_KINDS = ["workflow", "cron", "queue", "d1", "kv", "r2", "service", "email", "external-api", "gh-actions", "pages", "owner-tap", "metric"];

// Signals that enter from outside the fleet. Each names where it comes from; the flows that read it are its consumers.
export const EXTERNAL_SOURCES = {
  "ext.job_postings": "public job boards and ATS feeds (Greenhouse, Lever, Ashby, Workable, ...)",
  "ext.employer_mail": "employer replies to the application address rowan.quni@qnfo.org (Email Routing to qnfo-email)",
  "ext.owner_tap": "taps Rowan makes at fleet.qnfo.org/focus, jobs.q08.org and me.q08.org (owner_asks, jobsearch_feedback)",
  "ext.news_sources": "news, institutional and publisher feeds of the signal registry (sig_sources)",
  "ext.market_resolutions": "settled prediction questions and public evidence",
  "ext.social_graph": "Bluesky and Mastodon follows, replies and likes",
  "ext.reader_visits": "Cloudflare Web Analytics page loads and UTM clicks on fleet and brand pages",
  "ext.outreach_replies": "replies to outreach mail",
  "ext.research_sources": "full texts the research pipeline grounds on (arXiv HTML, QNFO papers)",
  "ext.video_views": "YouTube views and average view duration of the QNFO Shorts (Data API statistics, Analytics retention)"
};

// Implicit signals every scheduled flow carries: its heartbeat goes to the clock watchdog, and repairs come back as deploys.
export const IMPLICIT_OUT = ["fleet.heartbeat"];
export const IMPLICIT_IN = ["fleet.deploy"];

const b = (kind, name) => ({ kind, name });

export const FLOWS = [
  // ------------------------------------------------------------------ jobs
  { id: "jobs-sweep", label: "Job sweep: postings scored against the record", scope: "personal", plane: "jobs", worker: "qnfo-jobsearch",
    executor: b("cron", "qnfo-jobsearch hourly run()"), clock: "jobs-sweep",
    inflows: [{ signal: "ext.job_postings", via: b("external-api", "ATS feeds") }, { signal: "cv.bank", via: b("d1", "qnfo-audit.jobsearch_bank") },
      { signal: "jobs.outcome_weights", via: b("d1", "qnfo-audit.jobsearch_events (applied snapshot + outcomes)") },
      { signal: "jobs.owner_prefs", via: b("d1", "qnfo-audit.jobsearch_prefs, jobsearch_feedback") },
      { signal: "resume.weights", via: b("d1", "flow_adaptations jobs.resume_weights (RESUME_W in buildResume)") }],
    outflows: [{ signal: "jobs.match", via: b("d1", "qnfo-audit.jobsearch_matches") },
      { signal: "resume.tailored", via: b("d1", "jobsearch_matches.resume_md (tailoredResume, ranked by resume.weights)") }],
    feedback: "jobs.outcome_weights and jobs.owner_prefs re-weight every score, and resume.weights re-rank the facts and summary each tailored resume leads with: what got replies, and what Rowan turned down, changes what is shown and sent next" },
  { id: "jobs-shortlist", label: "Shortlist: Rowan approves or turns down", scope: "personal", plane: "jobs", worker: "qnfo-jobsearch",
    executor: b("owner-tap", "jobs.q08.org"), clock: "jobs-shortlist",
    inflows: [{ signal: "jobs.match", via: b("d1", "qnfo-audit.jobsearch_matches") }, { signal: "ext.owner_tap", via: b("owner-tap", "jobs.q08.org") }],
    outflows: [{ signal: "jobs.approved", via: b("d1", "jobsearch_matches.status approved") }, { signal: "jobs.owner_prefs", via: b("d1", "qnfo-audit.jobsearch_feedback") }],
    feedback: "each turn-down reason is learned (jobsearch_feedback) and changes the next sweep's ranking" },
  { id: "cv-recall", label: "CV recall: posting gaps become yes/no questions", scope: "personal", plane: "jobs", worker: "qnfo-jobsearch",
    executor: b("cron", "qnfo-jobsearch syncSkillAsks, resume-claim asks"), clock: "jobs-sweep",
    inflows: [{ signal: "jobs.approved", via: b("d1", "posting requirements") }, { signal: "ext.owner_tap", via: b("owner-tap", "owner_asks cv-skill, resume-claim") }],
    outflows: [{ signal: "cv.bank", via: b("d1", "qnfo-audit.jobsearch_bank") }, { signal: "cv.skills", via: b("service", "GET jobs.q08.org/api/cv-skills") }],
    feedback: "a yes writes the claim into the CV bank, which the next sweep and the next tailored resume read" },
  { id: "resume-sync", label: "Resume: confirmed skills into RESUME.md and the PDF", scope: "personal", plane: "profile", repo: "rwnq8/resume",
    executor: b("gh-actions", "confirmed-skills.yml hourly"), clock: "confirmed-skills",
    inflows: [{ signal: "cv.skills", via: b("service", "GET jobs.q08.org/api/cv-skills") }, { signal: "brand.surface_drift", via: b("gh-actions", "surface-audit loop issues") }],
    outflows: [{ signal: "resume.text", via: b("gh-actions", "rwnq8/resume RESUME.md and CV PDF") }],
    feedback: "drift found by the surface audit is fixed in the resume; outcomes reach it through cv.skills" },
  { id: "job-apply", label: "Auto-apply runner", scope: "personal", plane: "jobs", repo: "rwnq8/personal-life",
    executor: b("gh-actions", "job-apply.yml every 2 h"), clock: "job-apply",
    inflows: [{ signal: "jobs.approved", via: b("service", "jobs.q08.org/api/autopilot/queue") }, { signal: "resume.text", via: b("gh-actions", "RESUME.md wording") },
      { signal: "resume.tailored", via: b("service", "tailored resume_md served with the queue item") }],
    outflows: [{ signal: "job.applied", via: b("service", "jobs.q08.org/api/autopilot/result -> jobsearch_events applied (snapshot of score and features)") },
      { signal: "resume.sent", via: b("d1", "jobsearch_apps.resume_md, frozen at applied on every path") },
      { signal: "job.application", to: "ext.employer", returns: "ext.employer_mail", via: b("external-api", "ATS application forms, reply-to rowan.quni@qnfo.org") }],
    feedback: "the employer's answer returns as ext.employer_mail and becomes job.outcome" },
  { id: "job-mail-in", label: "Employer mail into the job pipeline", scope: "personal", plane: "jobs", worker: "qnfo-email",
    executor: b("email", "Email Routing rowan.quni@qnfo.org -> qnfo-email -> qnfo-jobsearch /api/mail-in"), clock: null,
    clock_reason: "event-driven by inbound mail; its effect is measured by jobsearch_reply_rate_90d",
    inflows: [{ signal: "ext.employer_mail", via: b("email", "rowan.quni@qnfo.org") }],
    outflows: [{ signal: "job.outcome", via: b("service", "JOBS service binding -> applyJobMail -> jobsearch_events replied|screening|interview|offer|rejected") }],
    feedback: "every recognised employer mail moves the application and teaches the scorer" },
  { id: "job-outcome-asks", label: "Outcome taps: has the employer answered?", scope: "personal", plane: "jobs", worker: "qnfo-jobsearch",
    executor: b("cron", "qnfo-jobsearch syncOutcomeAsks hourly"), clock: "jobs-sweep",
    inflows: [{ signal: "job.applied", via: b("d1", "jobsearch_events applied, 14/28/42 days old") }, { signal: "ext.owner_tap", via: b("owner-tap", "owner_asks job-outcome") }],
    outflows: [{ signal: "job.outcome", via: b("d1", "jobsearch_events replied|interview|rejected") }],
    feedback: "a reply Rowan saw outside the routed address still reaches the scorer; 'Nothing yet' leaves the application open (no reply is not a rejection)" },
  { id: "job-application", label: "Job application run (Cloudflare Workflow)", scope: "personal", plane: "jobs", worker: "personal-companion",
    executor: b("workflow", "job-application"), clock: "companion-tick",
    inflows: [{ signal: "job.applied", via: b("d1", "jobsearch_events applied") }, { signal: "job.outcome", via: b("d1", "jobsearch_matches.status, polled daily") }],
    outflows: [{ signal: "job.milestone", via: b("d1", "qnfo-audit.pipeline_runs, pipeline_evidence") }],
    feedback: "the run ends on the outcome the employer gave, which the personal pipeline counts as a win or a lesson" },
  { id: "jobs-outcome-learner", label: "Outcome learner: what gets replies re-weights the score", scope: "personal", plane: "jobs", worker: "qnfo-jobsearch",
    executor: b("cron", "qnfo-jobsearch outcomeScoreWeights in loadCtx"), clock: "jobs-sweep",
    inflows: [{ signal: "job.outcome", via: b("d1", "jobsearch_events") }],
    outflows: [{ signal: "jobs.outcome_weights", via: b("d1", "flow_adaptations jobs.outcome_weights (kept or rolled back)") }],
    feedback: "each change of weights is an adaptation with a prediction on jobsearch_reply_rate_90d; a miss rolls it back",
    adapts: { knob: "jobs.outcome_weights", metric: "jobsearch_reply_rate_90d" } },
  { id: "resume-outcome-learner", label: "Resume learner: what the sent resume said, against the answer it got", scope: "personal", plane: "jobs", worker: "qnfo-jobsearch",
    executor: b("cron", "qnfo-jobsearch resumeOutcomeWeights in loadCtx (RESUME-OUTCOME-LOOP-1)"), clock: "jobs-sweep",
    inflows: [{ signal: "resume.sent", via: b("d1", "jobsearch_apps.resume_md read back into summary and fact ids") }, { signal: "job.outcome", via: b("d1", "jobsearch_events") }],
    outflows: [{ signal: "resume.weights", via: b("d1", "flow_adaptations jobs.resume_weights (kept or rolled back)") }],
    feedback: "facts and summaries that went out with replies lead the next tailored resume; each change is an adaptation on jobsearch_reply_rate_90d and a miss writes flow_knob:jobs.resume_weights = off",
    adapts: { knob: "jobs.resume_weights", metric: "jobsearch_reply_rate_90d" } },

  // ------------------------------------------------------------------ outreach, touchpoints, social
  { id: "outreach-mail", label: "Outreach mail with the segment learner", scope: "qniverse", plane: "outreach", worker: "qnfo-cloud-ops",
    executor: b("cron", "qnfo-outreach send, qnfo-cloud-ops reply learner (outreach_learner_arms)"), clock: "outreach-mail",
    inflows: [{ signal: "outreach.reply", via: b("d1", "outreach_learner_arms alpha/beta") }, { signal: "paper.published", via: b("d1", "papers to announce") }],
    outflows: [{ signal: "outreach.mail", to: "ext.outreach_replies", returns: "ext.outreach_replies", via: b("email", "qnfo-email send") }],
    feedback: "replies and opt-outs update each segment's Beta(alpha, beta); a segment under 1% after 50 sends stops" },
  { id: "outreach-replies", label: "Outreach replies into the learner", scope: "qniverse", plane: "outreach", worker: "qnfo-email",
    executor: b("email", "Email Routing qnfo@qnfo.org -> qnfo-email"), clock: null, clock_reason: "event-driven by inbound mail",
    inflows: [{ signal: "ext.outreach_replies", via: b("email", "qnfo@qnfo.org") }],
    outflows: [{ signal: "outreach.reply", via: b("d1", "outreach_log, outreach_learner_sends") }],
    feedback: "the reply is the learner's reward" },
  { id: "touchpoints", label: "Touchpoints: follows, likes, replies, prunes", scope: "qniverse", plane: "outreach", worker: "qnfo-social",
    executor: b("cron", "qnfo-social hourly touch tick"), clock: "touchpoints",
    inflows: [{ signal: "touch.outcome", via: b("d1", "touch_actions.outcome (followed-back, replied, liked-back)") }, { signal: "ext.owner_tap", via: b("owner-tap", "fleet.qnfo.org/touch approvals") }],
    outflows: [{ signal: "touch.action", to: "ext.social_graph", returns: "ext.social_graph", via: b("external-api", "Bluesky, Mastodon") }],
    feedback: "attentiveness (reply share, follow-back ratio) re-scores touch_targets, so the next touches go to people who answer" },
  { id: "touch-outcomes", label: "Touch outcomes read back from the social graph", scope: "qniverse", plane: "outreach", worker: "qnfo-social",
    executor: b("cron", "qnfo-social hourly touch tick"), clock: "touchpoints",
    inflows: [{ signal: "ext.social_graph", via: b("external-api", "Bluesky, Mastodon") }],
    outflows: [{ signal: "touch.outcome", via: b("d1", "touch_actions.outcome") }],
    feedback: "closes the touchpoint loop" },
  { id: "social-posts", label: "Posts and roll-ups", scope: "qniverse", plane: "outreach", worker: "qnfo-social",
    executor: b("cron", "qnfo-social drain"), clock: null, clock_reason: "measured by papers_queued_over_120m and outreach_clicks_per_post_7d",
    inflows: [{ signal: "paper.published", via: b("d1", "papers queue") }, { signal: "reader.engagement", via: b("d1", "utm ledger, v_channel_impact_7d") }],
    outflows: [{ signal: "social.post", to: "ext.reader_visits", returns: "ext.reader_visits", via: b("external-api", "Bluesky, Mastodon, Buffer") }],
    feedback: "clicks and engaged sessions per channel steer the attention shares (pipeline_flags.social_share_floor)" },
  { id: "reader-measure", label: "Reader measurement (bot-filtered)", scope: "qniverse", plane: "outreach", worker: "qnfo-fleet-dashboard",
    executor: b("cron", "qnfo-fleet-dashboard refreshHumanAudience hourly"), clock: null, clock_reason: "metric freshness of external_referred_pageviews_7d is its beat",
    inflows: [{ signal: "ext.reader_visits", via: b("external-api", "Cloudflare GraphQL rumPageloadEventsAdaptiveGroups") }],
    outflows: [{ signal: "reader.engagement", via: b("metric", "external_referred_pageviews_7d, engaged_reader_sessions_7d") },
      { signal: "site.engagement", via: b("metric", "brand_site_pageviews_7d (rwnq8.github.io)") }],
    feedback: "readers, not clicks, set the research budget and the channel shares" },

  { id: "subscriber-digest", label: "Weekly paper digest to subscribers", scope: "qniverse", plane: "outreach", worker: "qnfo-subscribers",
    executor: b("cron", "qnfo-subscribers hourly grid, weekly digest run"), clock: null, clock_reason: "weekly digest; its hourly heartbeat is fleet_heartbeat qnfo-subscribers and subscriber_digest_runs is its run ledger",
    inflows: [{ signal: "paper.published", via: b("d1", "qnfo-audit.papers -> weekly_signal_issues") }],
    outflows: [{ signal: "digest.mail", to: "ext.subscribers", returns: "ext.reader_visits", via: b("email", "confirmed subscribers, one-click unsubscribe, UTM-tagged links") }],
    feedback: "digest clicks are counted into reach_signals (utm), read by reader measurement, and the readers they bring set the research budget that fills the next digest; unsubscribes go to email_suppression" },
  { id: "youtube-shorts", label: "YouTube Shorts from plain-language papers", scope: "qniverse", plane: "outreach", worker: "qnfo-youtube-shorts",
    executor: b("cron", "qnfo-youtube-shorts hourly"), clock: null, clock_reason: "hourly heartbeat in fleet_heartbeat qnfo-youtube-shorts; youtube_uploads_30d is its measured beat",
    inflows: [{ signal: "paper.published", via: b("d1", "living-paper.plain_article") }, { signal: "reader.engagement", via: b("d1", "paper_readership ext_30d, pv_30d (rankByInterest)") },
      { signal: "ext.video_views", via: b("external-api", "YouTube Data API statistics, YouTube Analytics retention (readRetention)") },
      { signal: "video.retention", via: b("d1", "youtube_videos retention/views, else social_video_posts x social_engagements (laneWeights)") }],
    outflows: [{ signal: "video.short", to: "ext.video_viewers", returns: "ext.video_views", via: b("external-api", "YouTube upload") },
      { signal: "video.retention", via: b("d1", "youtube_videos.views, avg_view_duration_s; metric youtube_avg_view_duration_s") }],
    feedback: "each Short is scored by retention, else views, else engagement on the posts that carried it; per-category lane weights (laneWeights, YT-WATCH-LOOP-1) scale rankByInterest, so what earlier Shorts earned chooses the next Short" },

  // ------------------------------------------------------------------ brand surfaces
  { id: "surface-audit", label: "Public surface audit against the brand file", scope: "personal", plane: "profile", repo: "rwnq8/resume",
    executor: b("gh-actions", "surface-audit.yml daily"), clock: "surface-audit",
    inflows: [{ signal: "resume.text", via: b("gh-actions", "RESUME.md") }, { signal: "site.page", via: b("pages", "rwnq8.github.io") }, { signal: "profile.bio", via: b("external-api", "GitHub profile README") }],
    outflows: [{ signal: "brand.surface_drift", via: b("gh-actions", "loop issue per drifted surface") }],
    feedback: "drift becomes a loop issue that the site, profile and resume flows fix" },
  { id: "site-publish", label: "Personal site rwnq8.github.io", scope: "personal", plane: "profile", repo: "rwnq8/rwnq8.github.io",
    executor: b("pages", "GitHub Pages on push"), clock: null, clock_reason: "event-driven by pushes; the surface audit is its daily check",
    inflows: [{ signal: "brand.surface_drift", via: b("gh-actions", "surface-audit loop issues") }, { signal: "resume.text", via: b("gh-actions", "RESUME.md") }, { signal: "site.engagement", via: b("kv", "ops_config site_engagement_top via /api/site-engagement (daily READ-MOST rebuild, rwnq8.github.io#18)") }],
    outflows: [{ signal: "site.page", via: b("pages", "rwnq8.github.io (read back by the surface audit)") },
      { signal: "site.reach", to: "ext.reader", returns: "ext.reader_visits", via: b("pages", "rwnq8.github.io + Cloudflare Web Analytics beacon") }],
    feedback: "bot-filtered top paths (SITE-ENGAGEMENT-LOOP-1) rewrite the site's Most read block daily, so what readers reach chooses what the site leads with" },
  { id: "profile-sync", label: "Profile and bio sync", scope: "personal", plane: "profile", worker: "qnfo-fleet-dashboard",
    executor: b("cron", "qnfo-fleet-dashboard every 6 h"), clock: "profile-sync",
    inflows: [{ signal: "resume.text", via: b("gh-actions", "brand wording") }, { signal: "brand.surface_drift", via: b("gh-actions", "surface-audit") }],
    outflows: [{ signal: "profile.bio", via: b("external-api", "GitHub, Bluesky bios") }],
    feedback: "the surface audit reads the bios back and files drift" },

  // ------------------------------------------------------------------ personal
  { id: "personal-pipeline", label: "Personal pipeline (Cloudflare Workflow)", scope: "personal", plane: "personal", worker: "personal-companion",
    executor: b("workflow", "personal-pipeline"), clock: "companion-tick",
    inflows: [{ signal: "ext.owner_tap", via: b("owner-tap", "me.q08.org evening tap") }, { signal: "job.milestone", via: b("d1", "pipeline_runs") }, { signal: "companion.rating", via: b("d1", "personal-life asks") }],
    outflows: [{ signal: "personal.pattern", via: b("d1", "personal-life pipeline outcomes and patterns") }],
    feedback: "patterns choose tomorrow's ask and the brief's lines" },
  { id: "companion-generation", label: "Companion pieces (Cloudflare Workflow)", scope: "personal", plane: "personal", worker: "personal-companion",
    executor: b("workflow", "companion-generation"), clock: "companion-tick",
    inflows: [{ signal: "personal.pattern", via: b("d1", "personal-life") }],
    outflows: [{ signal: "companion.piece", to: "ext.owner", returns: "ext.owner_tap", via: b("email", "me.q08.org and the morning mail") }],
    feedback: "the weekly 'did this help' tap returns as companion.rating" },
  { id: "companion-ratings", label: "Did this help: taps into ratings", scope: "personal", plane: "personal", worker: "personal-companion",
    executor: b("cron", "personal-companion hourly"), clock: "companion-tick",
    inflows: [{ signal: "ext.owner_tap", via: b("owner-tap", "me.q08.org") }],
    outflows: [{ signal: "companion.rating", via: b("d1", "personal-life") }],
    feedback: "closes the companion loop" },
  { id: "daily-brief", label: "Daily brief", scope: "personal", plane: "personal", worker: "personal-api",
    executor: b("cron", "personal-api daily"), clock: "daily-brief",
    inflows: [{ signal: "personal.pattern", via: b("service", "personal-companion briefLines") }],
    outflows: [{ signal: "brief.mail", to: "ext.owner", returns: "ext.owner_tap", via: b("email", "morning brief") }],
    feedback: "the brief's taps return to the personal pipeline" },

  // ------------------------------------------------------------------ research and signals
  { id: "research-exec", label: "Research pipeline: idea to paper", scope: "qniverse", plane: "research", worker: "qnfo-research-exec",
    executor: b("cron", "qnfo-research-exec hourly"), clock: "research-exec",
    inflows: [{ signal: "research.focus", via: b("d1", "owner_asks research focus -> research_lines.owner_focus") }, { signal: "reader.engagement", via: b("d1", "v_research_volume_target") },
      { signal: "ext.research_sources", via: b("external-api", "arXiv HTML, QNFO papers") }, { signal: "signal.item", via: b("d1", "signals -> idea_proposals") },
      { signal: "research.run_outcome", via: b("d1", "research_queue.score via research_line_outcomes") }],
    outflows: [{ signal: "paper.published", via: b("d1", "papers (living-paper)") }],
    feedback: "readers set the research budget; Rowan's focus taps push, keep or pause lines" },
  { id: "research-run", label: "Research run (Cloudflare Workflow)", scope: "qniverse", plane: "research", worker: "personal-companion",
    executor: b("workflow", "research-run"), clock: "companion-tick",
    inflows: [{ signal: "paper.published", via: b("d1", "research_queue.status") }],
    outflows: [{ signal: "research.run_outcome", via: b("d1", "pipeline_runs -> research_line_outcomes (triggers pipeline_runs_research_outcome_au/_ai)") }],
    feedback: "each finished run's outcome is recorded per research line and moves that line's waiting ideas' score (+0.02 published, -0.02 parked or dropped), so the research pipeline draws next from lines that publish; v_research_line_yield" },
  { id: "research-focus", label: "Research focus taps", scope: "qniverse", plane: "research", worker: "qnfo-fleet-dashboard",
    executor: b("owner-tap", "fleet.qnfo.org/focus, recall-loop task"), clock: null, clock_reason: "the recall-loop fleet task re-asks every 14 days",
    inflows: [{ signal: "ext.owner_tap", via: b("owner-tap", "owner_asks") }],
    outflows: [{ signal: "research.focus", via: b("d1", "research_lines.owner_focus (D1 triggers)") }],
    feedback: "a pause moves ideas to owner_paused, a push raises their score" },
  { id: "signals", label: "Signal engine: sources to signals", scope: "qniverse", plane: "research", worker: "q08-signal-engine",
    executor: b("cron", "q08-signal-engine sigTick every 30 min"), clock: "signals",
    inflows: [{ signal: "ext.news_sources", via: b("external-api", "sig_sources registry") }, { signal: "forecast.citation", via: b("d1", "q08-signal sig_sources.quality (forecast citations)") }],
    outflows: [{ signal: "signal.item", via: b("d1", "q08-signal.signal_log, /api/signals") }],
    feedback: "sources are scored by yield and by how often forecasts cite them, then promoted, quarantined or retired" },
  { id: "markets", label: "Forecasts and markets", scope: "qniverse", plane: "research", worker: "q08-prediction-markets",
    executor: b("cron", "q08-prediction-markets every 5 min"), clock: "markets",
    inflows: [{ signal: "signal.item", via: b("service", "q08 /api/signals") }, { signal: "ext.market_resolutions", via: b("external-api", "settlement evidence") }],
    outflows: [{ signal: "forecast.citation", via: b("d1", "citations of signals in forecasts") }],
    feedback: "settled forecasts score the signals and sources they cited" },

  // ------------------------------------------------------------------ fleet meta loops
  { id: "clock-watchdog", label: "Clock watchdog", scope: "qniverse", plane: "fleet", worker: "qnfo-cloud-ops",
    executor: b("cron", "qnfo-cloud-ops jobClockwork every 10 min"), clock: null, clock_reason: "the watchdog's own heartbeat row (fleet_heartbeat clockwork)",
    inflows: [{ signal: "fleet.heartbeat", via: b("d1", "fleet_heartbeat, run tables, GitHub runs") }],
    outflows: [{ signal: "fleet.issue", via: b("d1", "clock_ticks, CLOCKWORK-<loop> agent_issues, repair dispatches") }],
    feedback: "a stopped or inaccurate clock is repaired; three bad ticks file an issue the code loop fixes" },
  { id: "flow-audit", label: "Flow audit (this registry)", scope: "qniverse", plane: "fleet", worker: "personal-companion",
    executor: b("cron", "personal-companion hourly FR.flowsTick"), clock: "companion-tick",
    inflows: [{ signal: "fleet.heartbeat", via: b("d1", "clock_ticks (every clock must belong to a flow)") }],
    outflows: [{ signal: "fleet.issue", via: b("metric", "flow_open_loops, flow_unmapped_clocks -> analytics_metric_triggers -> agent_issues") }],
    feedback: "an open loop is a metric breach; the fleet closes it and the metric returns to 0" },
  { id: "code-loop", label: "Code loop and ops executor", scope: "qniverse", plane: "fleet", worker: "qnfo-code-orchestrator",
    executor: b("workflow", "ops-exec-workflow (qnfo-ops)"), clock: null, clock_reason: "code_task_success_rate_30d and the merge lane are its beats",
    inflows: [{ signal: "fleet.issue", via: b("d1", "agent_issues with code-task lines") }],
    outflows: [{ signal: "fleet.deploy", via: b("gh-actions", "merged PRs -> canonical-deploy.yml") }],
    feedback: "deploys are verified by probes and the clocks; a regression reverts" },
  { id: "radar-watch", label: "Events radar (Cloudflare Workflow)", scope: "qniverse", plane: "research", worker: "radar-hub",
    executor: b("workflow", "events-radar-watch"), clock: null, clock_reason: "weekly Workflow instances; cron heartbeat in fleet_heartbeat",
    inflows: [{ signal: "ext.news_sources", via: b("external-api", "event sources") },
      { signal: "signal.item", via: b("d1", "idea_proposals decision ACCEPT seed the arXiv radar terms (NO-TOPIC-HARDCODE-1)") }],
    outflows: [{ signal: "signal.item", via: b("d1", "events_radar, idea_proposals, outreach_queue") }],
    feedback: "radar items enter the research and outreach queues, and the ideas accepted there seed the next radar scan's terms; the job-market scan was retired 2026-11-12 into the hourly jobs-sweep (JOB-MARKET-RETIRED-1)" },
  // ------------------------------------------------------------------ fleet workers on a cron (FLOW-DECLARE-ALL-1: the former UNDECLARED_CRON_WORKERS list)
  { id: "idea-hub", label: "Idea hub: signals and re-entering papers to proposals", scope: "qniverse", plane: "research", worker: "idea-hub",
    executor: b("cron", "idea-hub hourly ideationCycle"), clock: null, clock_reason: "hourly at :25; idea_proposals.created_at and the cron grid log are its beat",
    inflows: [{ signal: "paper.published", via: b("d1", "artifact_reentry signals (published papers re-enter as ideas)") }, { signal: "ext.news_sources", via: b("d1", "signals status='new'") }],
    outflows: [{ signal: "signal.item", via: b("d1", "idea_proposals (scored ACCEPT, diversity-capped)") }],
    feedback: "accepted proposals become papers through the research pipeline, and published papers re-enter here as signals; the diversity cap reads the 30-day accepts it produced" },
  { id: "fleet-agents", label: "Fleet code agent: queued requests and schedules to runs", scope: "qniverse", plane: "fleet", worker: "qnfo-agents",
    executor: b("cron", "qnfo-agents every 5 min drainRequests, expireApprovals"), clock: null, clock_reason: "fleet_heartbeat qnfo-agents (CRON-HEARTBEAT-1) on every 5-minute drain",
    inflows: [{ signal: "fleet.issue", via: b("d1", "agent requests from the console, ops intake and issues") }, { signal: "fleet.memory", via: b("service", "qnfo-memory-mcp fleet graph and memory") }],
    outflows: [{ signal: "fleet.deploy", via: b("gh-actions", "pull requests the agent runs open -> canonical deploy") }],
    feedback: "a run's pull request deploys, the probes and clocks re-measure, and a failure comes back as a new issue the agent drains" },
  { id: "ai-calibration", label: "Model route prober and calibration", scope: "qniverse", plane: "fleet", worker: "qnfo-ai-calibration",
    executor: b("cron", "qnfo-ai-calibration every 30 min runProbe, checkFreshness, checkHealthCoverage"), clock: null, clock_reason: "fleet_heartbeat qnfo-ai-calibration (CRON-ONLY-HEARTBEAT-1)",
    inflows: [{ signal: "ai.spend", via: b("d1", "ai_call_counters, ai_spend_ledger (which models the fleet actually calls)") }, { signal: "fleet.deploy", via: b("gh-actions", "canonical deploy of qnfo-ai") }],
    outflows: [{ signal: "ai.route_health", via: b("d1", "model_health, route probe rows") }, { signal: "fleet.issue", via: b("d1", "alerts and agent_issues on stale or unhealthy routes") }],
    feedback: "route health steers the router's model choice; the calls the router then makes are what the next probe covers" },
  { id: "ai-router", label: "AI router: cascade shadow and spend governor", scope: "qniverse", plane: "fleet", worker: "qnfo-ai",
    executor: b("cron", "qnfo-ai hourly cascadeShadowTick"), clock: null, clock_reason: "hourly cascade-shadow run ids in its ledger; the router's request path is its live beat",
    inflows: [{ signal: "ai.route_health", via: b("d1", "model_health") }],
    outflows: [{ signal: "ai.spend", via: b("d1", "ai_spend_ledger, ai_call_counters, cascade shadow verdicts") }],
    feedback: "shadow verdicts and spend per model feed calibration and the waste agent, whose findings change the routes the router picks next" },
  { id: "ask-loop", label: "Ask surface: measure, judge and improve answers", scope: "qniverse", plane: "outreach", worker: "qnfo-ai-search",
    executor: b("cron", "qnfo-ai-search hourly loopTick (judge, measure, golden-set eval)"), clock: null, clock_reason: "fleet_heartbeat qnfo-ai-search (CRON-ONLY-HEARTBEAT-1)",
    inflows: [{ signal: "paper.index", via: b("d1", "AI Search instance over the paper corpus") }, { signal: "ext.reader_visits", via: b("d1", "ask_answers, /api/feedback helpful votes") }],
    outflows: [{ signal: "ask.answer", to: "ext.reader", returns: "ext.reader_visits", via: b("external-api", "ask.qwav.tech grounded answers") },
      { signal: "fleet.issue", via: b("d1", "ASK-FIX-1 code tasks that close themselves on recovery") }],
    feedback: "reader votes and judge verdicts grade each answer; an A/B winner is kept, a regression is reverted, and a breach files an ASK-FIX code task" },
  { id: "companion-guard", label: "me.q08.org guard: probe and roll back", scope: "personal", plane: "personal", worker: "qnfo-companion-guard",
    executor: b("cron", "qnfo-companion-guard every 15 min"), clock: null, clock_reason: "every 15 minutes; its probe rows are its beat",
    inflows: [{ signal: "fleet.deploy", via: b("gh-actions", "deploys of personal-api, the worker that serves me.q08.org") }],
    outflows: [{ signal: "fleet.issue", via: b("external-api", "COMPANION-GUARD-ROLLBACK-1 rollback to the previous deployment, alert row") }],
    feedback: "two failed probes roll personal-api back; the rollback is a deploy the next probe checks" },
  { id: "deploy-guard", label: "Deploy guard: claims, leases and fleet census", scope: "qniverse", plane: "fleet", worker: "qnfo-deploy-guard",
    executor: b("cron", "qnfo-deploy-guard every 20 min sweepExpiredClaims, fleet probe"), clock: null, clock_reason: "every 20 minutes; work_claims expiry and the shared fleet census are its beat",
    inflows: [{ signal: "fleet.deploy", via: b("d1", "deploy ledger events, work_claims") }],
    outflows: [{ signal: "fleet.issue", via: b("d1", "expired claims released, unhealthy census rows") }],
    feedback: "released claims return work to the code loop, whose deploys the guard's census reads next" },
  { id: "doc-gate", label: "Document gate: untraced documents to loops", scope: "qniverse", plane: "fleet", worker: "qnfo-doc-gate",
    executor: b("cron", "qnfo-doc-gate every 15 min run()"), clock: null, clock_reason: "doc_gate_runs is its run ledger",
    inflows: [{ signal: "fleet.deploy", via: b("r2", "audit and handoff documents written by sessions and loops") }],
    outflows: [{ signal: "fleet.issue", via: b("d1", "doc_audit dispositions, DOC-* cluster issues") }],
    feedback: "an untraced document becomes an issue the code loop turns into code or retires; the next run sees it traced" },
  { id: "fleet-control", label: "Fleet control: metric triggers, remediation, merge lane", scope: "qniverse", plane: "fleet", worker: "qnfo-fleet-control",
    executor: b("cron", "qnfo-fleet-control every 10 min and hourly"), clock: null, clock_reason: "tick_runs and fleet_tick are its ledgers (DOCTRINE tick)",
    inflows: [{ signal: "fleet.metric", via: b("d1", "metric_registry, v_metric_trigger_state") }, { signal: "fleet.deploy", via: b("gh-actions", "merged PRs and deploy ledger") }],
    outflows: [{ signal: "fleet.issue", via: b("d1", "agent_issues per breach, remediation contracts, lane merges") }],
    feedback: "a breach files an issue, the code loop deploys a fix, the metric is re-measured and the issue closes on its probe; remedy_efficacy_30d replaces a lever that did not move it" },
  { id: "paper-gateway", label: "Paper gateway: papers.qnfo.org pages, reports, provenance", scope: "qniverse", plane: "research", worker: "qnfo-gateway",
    executor: b("cron", "qnfo-gateway hourly grid (rrSweep, provSweep, daily IndexNow and render health)"), clock: null, clock_reason: "cron_fire_log rows of its grid (cronGridLog)",
    inflows: [{ signal: "paper.published", via: b("d1", "living-paper papers") }, { signal: "paper.render", via: b("r2", "PDFs rendered by qnfo-pdf") }],
    outflows: [{ signal: "paper.page", to: "ext.reader", returns: "ext.reader_visits", via: b("pages", "papers.qnfo.org, IndexNow pings") }, { signal: "fleet.metric", via: b("d1", "papers.render_defects, reader reports") }],
    feedback: "reader visits and reader reports return through reader measurement and the errata loop, which set the research budget and correct the next version" },
  { id: "github-steward", label: "GitHub steward: issue mirror, draft PRs, cost ledger", scope: "qniverse", plane: "fleet", worker: "qnfo-github-steward",
    executor: b("cron", "qnfo-github-steward every 10 min grid"), clock: null, clock_reason: "cron_fire_log rows of its grid",
    inflows: [{ signal: "fleet.issue", via: b("d1", "agent_issues to mirror; roadmap_mirror_scope") }],
    outflows: [{ signal: "fleet.deploy", via: b("gh-actions", "draft PR per issue (DRAFT-PR-PER-ISSUE-1), mirrored issues") }, { signal: "fleet.metric", via: b("d1", "cost_vendor_month github") }],
    feedback: "each draft PR is built and merged by the code lanes; a merged fix closes the issue it mirrors" },
  { id: "paper-indexer", label: "Paper indexer: impact, render health, vector index", scope: "qniverse", plane: "research", worker: "qnfo-infra",
    executor: b("cron", "qnfo-infra hourly (indexer, purge, daily impact)"), clock: null, clock_reason: "hourly logs and the metrics it refreshes (paper_render_defect_pages) are its beat",
    inflows: [{ signal: "paper.published", via: b("d1", "living-paper papers") }],
    outflows: [{ signal: "paper.index", via: b("service", "Vectorize paper index, AI Search ingest") }, { signal: "fleet.metric", via: b("d1", "paper_render_defect_pages, paper_math_browser_fail_pages") }],
    feedback: "render defects become metric breaches the fleet fixes; the index feeds the ask loop whose reader votes grade it" },
  { id: "intent-intake", label: "Intent intake: notes and tasks to issues, daily digest", scope: "qniverse", plane: "fleet", worker: "qnfo-intent-orchestrator",
    executor: b("cron", "qnfo-intent-orchestrator every 30 min grid, 06:00 digest"), clock: null, clock_reason: "cron_fire_log rows of its grid",
    inflows: [{ signal: "ext.owner_tap", via: b("d1", "intents captured from the console, ChatBox and notes") }],
    outflows: [{ signal: "fleet.issue", via: b("d1", "agent_issues (TASK-INTENT-INTAKE-1)") },
      { signal: "intent.digest", to: "ext.owner", returns: "ext.owner_tap", via: b("email", "daily intent digest of pending intents") }],
    feedback: "intents become issues the fleet closes; the digest lists what is still pending and the next taps answer it" },
  { id: "lifecycle", label: "Lifecycle: fleet-feed auto actions and backups", scope: "qniverse", plane: "fleet", worker: "qnfo-lifecycle",
    executor: b("cron", "qnfo-lifecycle hourly CRON_TABLE (CRON-SINGLE-TRIGGER-1)"), clock: null, clock_reason: "hourly; its CRON_TABLE run rows are its beat",
    inflows: [{ signal: "fleet.metric", via: b("service", "qnfo-fleet-feed /feed/self findings with auto_action") }],
    outflows: [{ signal: "fleet.issue", via: b("d1", "applied auto actions, backup rows, alerts") }],
    feedback: "findings are acted on and re-read on the next feed; what an auto action cannot fix stays an issue for the code loop" },
  { id: "memory-graph", label: "Memory and fleet graph tiers", scope: "qniverse", plane: "fleet", worker: "qnfo-memory-mcp",
    executor: b("cron", "qnfo-memory-mcp hourly exuviaCron, memoryTierSnapshot"), clock: null, clock_reason: "hourly at :35; memory tier snapshots are its beat",
    inflows: [{ signal: "fleet.deploy", via: b("d1", "fg_* graph rows rebuilt on each push (fleet-graph.yml)") }],
    outflows: [{ signal: "fleet.memory", via: b("service", "fleet-graph and memory MCP tools") }],
    feedback: "agents read the graph before a change; their deploys rebuild it" },
  { id: "observability", label: "Observability: trace ingest, autonomy scores", scope: "qniverse", plane: "fleet", worker: "qnfo-observability",
    executor: b("cron", "qnfo-observability hourly run()"), clock: null, clock_reason: "autonomy_scores.scored_at and the hourly digest are its beat",
    inflows: [{ signal: "fleet.deploy", via: b("r2", "Logpush workers_trace_events of every deployed worker") }],
    outflows: [{ signal: "fleet.metric", via: b("d1", "worker_logs, autonomy_scores, cloud_ops_events digest, alerts") }],
    feedback: "error ratios and autonomy scores become metric breaches; the fixes they cause show in the next ingest" },
  { id: "ops-registry", label: "Ops executor: registry refresh and deploys", scope: "qniverse", plane: "fleet", worker: "qnfo-ops",
    executor: b("cron", "qnfo-ops every 30 min registryRefresh"), clock: null, clock_reason: "every 30 minutes; deployment_history and the registry refresh are its beat",
    inflows: [{ signal: "fleet.issue", via: b("d1", "ops intake and deploy requests") }],
    outflows: [{ signal: "fleet.deploy", via: b("service", "/ops/deploy canonical path, service_registry") }],
    feedback: "deploys are verified by /health and probes; a failed one is reverted and filed" },
  { id: "pdf-backlog", label: "PDF renderer: every paper as a PDF", scope: "qniverse", plane: "research", worker: "qnfo-pdf",
    executor: b("cron", "qnfo-pdf every 10 min renderPdfBacklog"), clock: null, clock_reason: "fleet_heartbeat qnfo-pdf (writeCronHeartbeat)",
    inflows: [{ signal: "paper.published", via: b("d1", "papers without a current-renderer PDF") }],
    outflows: [{ signal: "paper.render", via: b("r2", "PDF per paper version") }],
    feedback: "the gateway serves the PDFs; render defects it measures come back as fixes to the renderer" },
  { id: "waste-agent", label: "Waste agent: AI spend per published output", scope: "qniverse", plane: "fleet", worker: "qnfo-waste-agent",
    executor: b("cron", "qnfo-waste-agent hourly run()"), clock: null, clock_reason: "waste_runs is its run ledger",
    inflows: [{ signal: "ai.spend", via: b("d1", "ai_call_counters -> waste_ledger") }],
    outflows: [{ signal: "fleet.issue", via: b("d1", "waste_findings, up to 5 code-task issues a run, closed after 3 clean runs") }],
    feedback: "a waste finding becomes a code task; the spend it removes is measured on the next runs and the finding closes after three clean runs" }

];

// Ultrastable's loops are declared in ultrastable/ultrastable instances/ultrastable/loop-registry.json with the same fields
// (inflows, outflows, feedback); `python3 -m foundation flows --check` there is the same check. Listed here so the map shows both scopes.
export const ULTRASTABLE_REGISTRY = { repo: "ultrastable/ultrastable", path: "instances/ultrastable/loop-registry.json", check: "python3 -m foundation flows --check" };

// Workers that run on a cron but have no flow above yet. Each is an open loop the flow audit counts (flow_undeclared_workers, target 0);
// the CI test fails a cron or Workflow worker that is in neither list, and an entry that is declared or no longer runs.
export const UNDECLARED_CRON_WORKERS = [];

// ------------------------------------------------------------------ validation
// A flow with a clock beats into the watchdog and receives repairs as deploys (IMPLICIT_OUT, IMPLICIT_IN).
export function withImplicit(f) {
  if (!f.clock) return f;
  return Object.assign({}, f, { inflows: (f.inflows || []).concat(IMPLICIT_IN.map((s) => ({ signal: s, via: { kind: "gh-actions", name: "canonical deploy" }, implicit: true }))),
    outflows: (f.outflows || []).concat(IMPLICIT_OUT.map((s) => ({ signal: s, via: { kind: "d1", name: "fleet_heartbeat / run tables" }, implicit: true }))) });
}

export function validateRegistry(flows0 = FLOWS, ext = EXTERNAL_SOURCES) {
  const flows = flows0.map(withImplicit);
  const errors = [], ids = new Set();
  const produced = new Map(), consumed = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  for (const f of flows) {
    if (!f.id || ids.has(f.id)) errors.push("duplicate or missing id: " + f.id);
    ids.add(f.id);
    if (!SCOPES.includes(f.scope)) errors.push(f.id + ": scope " + f.scope);
    if (!f.executor || !BINDING_KINDS.includes(f.executor.kind)) errors.push(f.id + ": executor kind");
    if (!(f.worker || f.repo)) errors.push(f.id + ": names neither a worker nor a repo");
    if (!f.inflows || !f.inflows.length) errors.push(f.id + ": no inflows");
    if (!f.outflows || !f.outflows.length) errors.push(f.id + ": no outflows");
    if (!f.feedback) errors.push(f.id + ": no feedback path");
    if (f.clock === undefined) errors.push(f.id + ": clock not declared (a loop id, or null with clock_reason)");
    if (f.clock === null && !f.clock_reason) errors.push(f.id + ": clock null without clock_reason");
    for (const x of f.inflows || []) {
      if (!x.via || !BINDING_KINDS.includes(x.via.kind)) errors.push(f.id + ": inflow " + x.signal + " binding kind");
      add(consumed, x.signal, f.id);
    }
    for (const x of f.outflows || []) {
      if (!x.via || !BINDING_KINDS.includes(x.via.kind)) errors.push(f.id + ": outflow " + x.signal + " binding kind");
      if (!x.to) add(produced, x.signal, f.id);   // an outflow to the world is consumed by the world; its `returns` is the signal that comes back
      if (x.to && !x.returns) errors.push(f.id + ": external outflow " + x.signal + " names no returning signal");
      if (x.returns) add(produced, x.returns, f.id + "<via world>");
    }
    if (f.gap && !(f.gap.loop_issue && f.gap.probe)) errors.push(f.id + ": gap without loop_issue and probe");
  }
  const openLoops = [];
  for (const [sig, by] of consumed) if (!produced.has(sig) && !ext[sig]) openLoops.push({ kind: "inflow-without-producer", signal: sig, flows: [...by] });
  const gapped = new Set(flows.filter((f) => f.gap).map((f) => f.id));
  for (const [sig, by] of produced) {
    const real = [...by].filter((x) => !x.endsWith("<via world>"));
    if (consumed.has(sig) || !real.length) continue;
    if (real.every((x) => gapped.has(x))) continue;   // accounted: the flow's declared gap carries the loop issue and its probe
    openLoops.push({ kind: "outflow-without-consumer", signal: sig, flows: real });
  }
  for (const s of Object.keys(ext)) if (!consumed.has(s)) openLoops.push({ kind: "external-source-unread", signal: s, flows: [] });
  // Feedback: a flow is closed when it lies on a cycle of the signal graph (its outputs come back, through other flows or the world, as its inputs).
  const g = edges(flows);
  const cyc = onCycle(flows.map((f) => f.id), g);
  const gaps = [];
  for (const f of flows) {
    if (f.gap) gaps.push({ flow: f.id, what: f.gap.what, loop_issue: f.gap.loop_issue, probe: f.gap.probe });
    if (!cyc.has(f.id) && !f.gap) openLoops.push({ kind: "no-feedback-cycle", signal: null, flows: [f.id] });
  }
  return { ok: errors.length === 0 && openLoops.length === 0, errors, open_loops: openLoops, gaps, closed: [...cyc].sort() };
}

// Directed flow-to-flow edges: A -> B when B consumes a signal A produces (an external outflow produces its returning signal).
export function edges(flows0 = FLOWS) {
  const flows = flows0.map(withImplicit);
  const prod = new Map();
  for (const f of flows) for (const o of f.outflows || []) for (const s of [o.signal].concat(o.returns ? [o.returns] : [])) {
    if (!prod.has(s)) prod.set(s, new Set()); prod.get(s).add(f.id);
  }
  const out = [];
  for (const f of flows) for (const i of f.inflows || []) for (const p of prod.get(i.signal) || []) out.push({ from: p, to: f.id, signal: i.signal, via: i.via });
  return out;
}

function onCycle(ids, es) {
  const adj = new Map(ids.map((i) => [i, []]));
  for (const e of es) if (adj.has(e.from)) adj.get(e.from).push(e.to);
  const res = new Set();
  for (const s of ids) {
    const seen = new Set(), stack = [...adj.get(s)];
    while (stack.length) { const n = stack.pop(); if (n === s) { res.add(s); break; } if (seen.has(n)) continue; seen.add(n); stack.push(...(adj.get(n) || [])); }
  }
  return res;
}

// The live map: nodes (flows and external sources) and edges, for /api/flows and the /pipelines card.
export function flowMap(flows = FLOWS) {
  const v = validateRegistry(flows);
  const nodes = flows.map((f) => ({ id: f.id, label: f.label, scope: f.scope, plane: f.plane, executor: f.executor.kind + ": " + f.executor.name,
    owner: f.worker || f.repo, clock: f.clock, closed: v.closed.includes(f.id), gap: f.gap ? f.gap.what : null,
    inflows: f.inflows.map((x) => x.signal), outflows: f.outflows.map((x) => x.signal + (x.returns ? " -> world -> " + x.returns : "")), feedback: f.feedback }));
  return { version: FLOW_VERSION, directive: DIRECTIVE_ID, nodes, edges: edges(flows).map((e) => ({ from: e.from, to: e.to, signal: e.signal })),
    external: EXTERNAL_SOURCES, ultrastable: ULTRASTABLE_REGISTRY, undeclared_workers: UNDECLARED_CRON_WORKERS,
    counts: { flows: flows.length, closed: v.closed.length, gaps: v.gaps.length, open_loops: v.open_loops.length, errors: v.errors.length, undeclared_workers: UNDECLARED_CRON_WORKERS.length },
    open_loops: v.open_loops, gaps: v.gaps, errors: v.errors };
}

// ------------------------------------------------------------------ runtime: publish, check against the clocks, settle adaptations
export const FLOW_DDL = [
  "CREATE TABLE IF NOT EXISTS flow_registry (id TEXT PRIMARY KEY, scope TEXT NOT NULL, plane TEXT, owner TEXT, clock TEXT, closed INTEGER NOT NULL, gap TEXT, json TEXT NOT NULL, version TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS flow_adaptations (id INTEGER PRIMARY KEY AUTOINCREMENT, flow TEXT NOT NULL, knob TEXT NOT NULL, new_hash TEXT NOT NULL, new_json TEXT, metric TEXT NOT NULL, op TEXT NOT NULL, baseline REAL, rollback_value TEXT NOT NULL DEFAULT 'off', created_at TEXT NOT NULL, due_at TEXT NOT NULL, settled_at TEXT, observed REAL, verdict TEXT, UNIQUE(knob, new_hash))",
  "CREATE INDEX IF NOT EXISTS flow_adaptations_due ON flow_adaptations(settled_at, due_at)"
];

export async function ensureFlowTables(db) { for (const s of FLOW_DDL) await db.prepare(s).run(); }

// A producer records an adaptation when one of its knobs changes: it predicts `metric op baseline` by due_at. Idempotent per (knob, hash).
export async function recordAdaptation(db, a, now = new Date().toISOString()) {
  await ensureFlowTables(db);
  const due = new Date(Date.parse(now) + (a.days || 30) * 864e5).toISOString();
  const r = await db.prepare("INSERT OR IGNORE INTO flow_adaptations (flow, knob, new_hash, new_json, metric, op, baseline, rollback_value, created_at, due_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(a.flow, a.knob, a.hash, a.json ? String(a.json).slice(0, 4000) : null, a.metric, a.op || ">=", a.baseline === undefined ? null : a.baseline, a.rollback || "off", now, due).run();
  return { recorded: !!(r && r.meta && r.meta.changes) };
}

export function judge(op, observed, baseline) {
  if (observed === null || observed === undefined || !Number.isFinite(observed)) return "inconclusive";
  if (baseline === null || baseline === undefined || !Number.isFinite(baseline)) return "kept-baseline-unknown";
  const hit = op === ">=" ? observed >= baseline : op === ">" ? observed > baseline : op === "<=" ? observed <= baseline : op === "<" ? observed < baseline : observed === baseline;
  return hit ? "kept" : "rolled-back";
}

// Settle due adaptations: read the metric, keep or roll back. A rollback writes ops_config flow_knob:<knob> = rollback_value, which the
// producer reads before it uses the knob. An inconclusive read (no measurement yet) is re-checked in 14 days, at most until 90 days old.
export async function settleAdaptations(db, now = new Date().toISOString(), limit = 20) {
  await ensureFlowTables(db);
  const rows = (await db.prepare("SELECT * FROM flow_adaptations WHERE settled_at IS NULL AND due_at <= ? ORDER BY due_at LIMIT ?").bind(now, limit).all()).results || [];
  const out = { due: rows.length, kept: 0, rolled_back: 0, inconclusive: 0 };
  for (const r of rows) {
    const m = await db.prepare("SELECT last_value FROM metric_registry WHERE metric = ?").bind(r.metric).first();
    const obs = m && m.last_value !== null && m.last_value !== undefined && m.last_value !== "" ? Number(m.last_value) : null;
    const v = judge(r.op, obs, r.baseline === null ? null : Number(r.baseline));
    if (v === "inconclusive" && Date.parse(now) - Date.parse(r.created_at) < 90 * 864e5) {
      await db.prepare("UPDATE flow_adaptations SET due_at = ? WHERE id = ?").bind(new Date(Date.parse(now) + 14 * 864e5).toISOString(), r.id).run();
      out.inconclusive++; continue;
    }
    await db.prepare("UPDATE flow_adaptations SET settled_at = ?, observed = ?, verdict = ? WHERE id = ?").bind(now, obs, v === "inconclusive" ? "kept-unmeasured" : v, r.id).run();
    if (v === "rolled-back") {
      await db.prepare("INSERT INTO ops_config (key, value, note) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, note = excluded.note")
        .bind("flow_knob:" + r.knob, r.rollback_value, "FLOW-DIRECTIVE-1: adaptation " + r.id + " missed " + r.metric + " " + r.op + " " + r.baseline + " (observed " + obs + "), rolled back " + now).run();
      out.rolled_back++;
    } else out.kept++;
  }
  return out;
}

async function putMetric(db, metric, value, now) {
  await db.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = 'MEASURED' WHERE metric = ?").bind(String(value), now, metric).run();
}

// The hourly flow audit (personal-companion, db = qnfo-audit).
export async function flowsTick(env, opts = {}) {
  const db = env.AUDIT, now = (opts.now || (() => new Date().toISOString()))();
  if (!db) return { skipped: "no AUDIT binding" };
  await ensureFlowTables(db);
  const map = flowMap(FLOWS);
  for (const n of map.nodes) {
    await db.prepare("INSERT INTO flow_registry (id, scope, plane, owner, clock, closed, gap, json, version, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET scope=excluded.scope, plane=excluded.plane, owner=excluded.owner, clock=excluded.clock, closed=excluded.closed, gap=excluded.gap, json=excluded.json, version=excluded.version, updated_at=excluded.updated_at")
      .bind(n.id, n.scope, n.plane, n.owner, n.clock, n.closed ? 1 : 0, n.gap, JSON.stringify(n), FLOW_VERSION, now).run();
  }
  const ids = map.nodes.map((n) => n.id);
  await db.prepare("DELETE FROM flow_registry WHERE id NOT IN (" + ids.map(() => "?").join(",") + ")").bind(...ids).run();
  // Runtime check: every clock the watchdog judges belongs to a declared flow.
  let unmapped = [];
  try {
    const clocks = ((await db.prepare("SELECT loop FROM clock_ticks").all()).results || []).map((r) => r.loop);
    const known = new Set(FLOWS.map((f) => f.clock).filter(Boolean));
    unmapped = clocks.filter((c) => !known.has(c));
  } catch (e) { unmapped = []; }
  const settled = await settleAdaptations(db, now);
  const openLoops = map.counts.open_loops + map.counts.gaps;
  const res = { flows: map.counts.flows, closed: map.counts.closed, open_loops: openLoops, unmapped_clocks: unmapped, undeclared_workers: map.counts.undeclared_workers, adaptations: settled };
  try {
    await putMetric(db, "flow_open_loops", openLoops, now);
    await putMetric(db, "flow_unmapped_clocks", unmapped.length, now);
    await putMetric(db, "flow_undeclared_workers", map.counts.undeclared_workers, now);
  } catch (e) { res.metric_error = String(e && e.message || e).slice(0, 200); }
  return res;
}

export async function flowsStatus(env) {
  const map = flowMap(FLOWS);
  if (env && env.AUDIT) {
    try { map.adaptations = (await env.AUDIT.prepare("SELECT flow, knob, metric, op, baseline, created_at, due_at, settled_at, observed, verdict FROM flow_adaptations ORDER BY id DESC LIMIT 20").all()).results || []; }
    catch (e) { map.adaptations = []; }
  }
  return map;
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// The flow map card on /pipelines: one row per flow, what comes in, what goes out, how it learns.
export function flowCard(map) {
  const c = map.counts;
  const line = c.open_loops + c.gaps === 0 ? "Every declared flow feeds its outcomes back into its next output."
    : (c.open_loops + c.gaps) + (c.open_loops + c.gaps === 1 ? " loop is" : " loops are") + " still open; each has a fleet issue and a probe that closes it.";
  const row = (n) => '<li class="pp-flow"><details><summary><span><b>' + esc(n.label) + '</b><br><span class="pp-mute">' + esc(n.owner) + " · " + esc(n.executor) + '</span></span><span class="ds-badge ds-badge-' + (n.gap ? "warn" : n.closed ? "good" : "bad") + '">' + (n.gap ? "Open" : n.closed ? "Loop" : "No loop") + "</span></summary>"
    + '<p class="pp-mute"><b>In:</b> ' + esc(n.inflows.join(", ")) + '<br><b>Out:</b> ' + esc(n.outflows.join(", ")) + '<br><b>Learns:</b> ' + esc(n.feedback) + (n.gap ? "<br><b>Open:</b> " + esc(n.gap) : "") + "</p></details></li>";
  const ad = (map.adaptations || []).slice(0, 5).map((a) => "<li>" + esc(a.knob) + ": predicted " + esc(a.metric) + " " + esc(a.op) + " " + esc(a.baseline) + " · " + esc(a.verdict || "due " + String(a.due_at || "").slice(0, 10)) + "</li>").join("");
  return '<section class="ds-card"><h2>Flows</h2><p>' + esc(line) + '</p><ol class="pp-stages">' + map.nodes.map(row).join("") + "</ol>"
    + '<p class="pp-mute">' + c.flows + " flows, " + c.closed + " on a feedback loop, " + c.gaps + " open with an issue, " + c.undeclared_workers + " cron workers still to declare. Ultrastable loops: " + esc(map.ultrastable.path) + ".</p>"
    + (ad ? '<p class="pp-mute">Recent adaptations (kept or rolled back by their prediction):</p><ul class="pp-mute">' + ad + "</ul>" : "") + "</section>";
}
