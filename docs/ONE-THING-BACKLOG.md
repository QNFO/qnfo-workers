# One Thing / Focus backlog and roadmap

Owner request: productive activity without required typing, with Yes/No controls, one-tap choices, checklists, and no additional LLM spend.

## Architecture (fixed)

- Product surface: **Focus** inside `https://me.q08.org/companion`.
- Canonical source: `QNFO/qnfo-workers`, `personal-api/companion.js`.
- Runtime: existing `personal-api` Cloudflare Worker on the `quniverse` account.
- State: existing D1 `tasks`, `cmp_activities`, and `cmp_activity_log` tables through existing authenticated APIs.
- Delivery: pull request to `main`, then the existing `canonical-deploy.yml` / `qnfo-ops` deployment path.
- Cost: no model call, new Worker, database, binding, subscription, or mirrored ticket system.

## Now — shipped in COMPANION-FOCUS-1

- [x] Focus tab in the existing companion.
- [x] 2 / 5 / 10 / 20-minute chips and low / okay / high-energy chips.
- [x] One recommendation from existing next actions and activities.
- [x] Yes / No / Surprise me controls.
- [x] Ephemeral timer and three-tap checklist.
- [x] Done records completion through existing action and activity APIs.
- [x] One-tap Qniverse presets saved into the existing action backlog.
- [x] No text, textarea, or select control in Focus.

## Next — evaluate only after real use

- [ ] Remember the last-used time and energy selections on the device.
- [ ] Add a one-tap “too long” control that splits an action into a smaller fixed step without AI.
- [ ] Add optional voice capture beside Focus using the existing recorder, only if requested.
- [ ] Add keyboard and screen-reader regression checks for the timer and checklist.

## Later — needs evidence before implementation

- [ ] Rank recommendations from existing activity ratings, without adding an LLM.
- [ ] Add calendar-aware time suggestions using the existing Today read model.
- [ ] Add home-screen shortcuts only if Focus becomes the main entry point.

## Explicit non-goals

- No standalone or localhost product.
- No second source of truth or duplicate GitHub issue storm.
- No required free text. If words are needed, use dictation through the existing Capture flow.
- No automatic AI usage or added recurring model spend.
