# DPIA — the personal twin and companion (personal-api, personal-companion) — DRAFT for owner review

Status: **DRAFT, 2026-10-26** (BP26-DPIA-1, agent_issues 1000343). Written by an automated fleet session from the code; the personal-life database was not read (research workers and this session do not read the personal plane). **Not legal advice**; no conclusion below is a statement that the processing complies with the GDPR. The owner decides. Review every year (next: 2027-10-26) and whenever the twin gains a data source. Related: docs/ROPA.md rows R3 and R9.

## 1. The processing

What it is. The twin (personal-api, served at me.q08.org) is the owner's personal assistant: an OpenAI-compatible chat endpoint and a companion app. Its store is the D1 database personal-life, which no research worker may bind (PERSONAL-QNFO-SEPARATION-1). From the table definitions in the worker it holds: tasks, daily briefs, journal, habits and habit logs, a budget, **location history**, wellbeing check-ins and mood, activity ratings, a **WHO-5 wellbeing measure every 14 days**, a **safety plan** the owner wrote (seven steps), notes, chat history and extracted facts, proactive signals and predictions, push subscriptions, voice-note media, and OAuth links to the owner's own Google and Microsoft accounts (calendar and mail sync). Answers are written by Workers AI models (`@cf/zai-org/glm-5.3-flash` first, `@cf/deepseek-ai/deepseek-v4-pro-0813` as the per-request fallback, `@cf/moonshotai/kimi-k2.6` last). reading.q08.org (personal-companion) publishes pieces and keeps a double-opt-in list in the same plane.

Data subjects. The owner (one person), and third parties who appear in the owner's notes, calendar, mail and contacts.

Purposes. Answer the owner's questions, plan the day, remind, and support wellbeing (behavioural activation, a GP suggestion when WHO-5 is low, crisis replies that add the owner's own safety plan). The twin never diagnoses.

## 2. Screening

| EDPB criterion | Applies | Why |
|---|---|---|
| 1 Evaluation or scoring | Yes | Mood, WHO-5 and activity ratings are scored; the twin builds predictions and proactive signals about the owner |
| 2 Automated decision with legal or similar effect | No | |
| 3 Systematic monitoring | Yes, of the owner by the owner | Location history and habit logs |
| 4 Sensitive or highly personal data | **Yes** | Health data (mental wellbeing, a safety plan), location, finances |
| 5 Large scale | No | One data subject |
| 6 Matching or combining datasets | Yes | Calendar, mail, notes, brief runs and contacts are combined in answers |
| 7 Vulnerable data subjects | Possibly | A person using a wellbeing companion may be vulnerable; here the user is the owner |
| 8 Innovative technology | Yes | Language models read the above to answer |
| 9 Prevents exercising a right | No | The privacy view, export and "delete everything" exist |

Four criteria apply. The AP list (2019) covers large-scale processing of health data and systematic monitoring; the scale here is one person.

## 3. Whether the GDPR applies: the household exemption

The decisive legal question is not for this document. Art. 2(2)(c) takes processing by a natural person "in the course of a purely personal or household activity" out of the GDPR. The twin is the owner's own tool, used by the owner for their own life, which points to the exemption for the owner's own data. Three things weaken it: the twin reads mail and calendars that name third parties; its models are run by processors; and the same owner runs a publishing and research business next to it on shared infrastructure. The case law reads the exemption narrowly. **Open question 1 for the owner and an adviser.** If the exemption does not apply, the owner's explicit consent as the data subject (Art. 9(2)(a)) is the natural basis for the health data, and this DPIA's measures are the file.

## 4. Risks and measures

| # | Risk | Existing measures (found in code or README) | Proposed measures | Residual |
|---|---|---|---|---|
| 1 | Health and location data leave the owner's control | One data subject; sign-in by an e-mailed one-time code, hashed codes and session tokens; separate database that research workers cannot bind; a privacy view, an export and "delete everything"; voice notes deleted after 30 days; a neutral lock-screen line for care pushes | Record where each model call runs; keep the safety plan out of any prompt that is logged | Low to medium |
| 2 | Models run by a processor read sensitive text | All three models are Workers AI models (Cloudflare); no third-party provider API was found in the twin's model list | Verify that no call leaves Cloudflare; AI Gateway payload logging off for the twin | Low if verified |
| 3 | OAuth refresh tokens for the owner's Google and Microsoft accounts sit in personal-life | A separate database and the one-user sign-in | Verify whether the tokens are encrypted at rest at application level; scope the sync to what the twin uses | Unknown until verified |
| 4 | Third parties' data from mail and calendar enter answers | The owner's own accounts only | Do not copy third-party mail bodies into long-lived tables; a retention period for synced content | Medium |
| 5 | Crisis handling errs (a miss, or a false alarm) | Fixed crisis lines, the owner's own safety plan, never a diagnosis, WHO-5 suggests a GP only | Review the crisis path with an adviser; keep the text under the owner's control | Medium (not a data-protection risk alone) |
| 6 | Retention without limit | Voice notes 30 days; "delete everything" | Periods for journal, location and chat in docs/RETENTION.md once the owner decides; the personal plane is not counted by the research runner | Medium |
| 7 | The consent list for reading.q08.org cannot be measured by the research runner | Double opt-in with a stored confirmation timestamp | A counts-only probe of the personal plane, if the owner allows it | Low |

## 5. Open questions

1. Does the household exemption cover the twin, given third-party data in mail and calendar and the use of processors?
2. Is any call of the twin sent to a provider API outside Cloudflare? (The model list says no.)
3. Are the OAuth tokens encrypted at rest at application level?
4. Retention periods for journal, location, chat and synced content.

## 6. Decision and review

Decision: pending the owner. The processing is live and used only by the owner. Next review 2027-10-26.
