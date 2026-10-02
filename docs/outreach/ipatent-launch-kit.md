# iPatent launch kit (2026-10-02, STRATEGY-1 s2.4a)

What the fleet posts on its own, and the ready-to-paste texts for the channels whose norms forbid automated posting
(STRATEGY s4: Hacker News, Reddit, LessWrong are manual only). Every text follows claim / test / status and makes no
legal claim. Lead link: `https://ipatent.qnfo.org/example` (a real run and what it got wrong). UTM: add
`?utm_source=<channel>&utm_medium=<social|community>&utm_campaign=ipatent-launch`.

## 1. Automatic (queued by the fleet)
`qnfo-audit.social_threads` slug `ipatent-example`, flag `selected`. qnfo-social posts it to Bluesky and cross-posts
through Buffer to LinkedIn, Mastodon and X, inside the cadence cap (2 per 7 days, counted from the 2026-10-01 reset),
the pause flag, the content gate and the link check.

> Claim: an AI-drafted provisional patent is only as good as what its description supports.
> Test: iPatent flags every claim element and value the description never backs up. A real run invented a torque range and a material; both flagged.
> Status: free, private by default, not legal advice.
> https://ipatent.qnfo.org/example

## 2. Hacker News (owner posts; Show HN rules: something people can try, no sign-up)
Title (under 80 chars):
> Show HN: iPatent – AI provisional patent drafts that flag unsupported claims

Text:
> I built a free tool that drafts a US provisional patent disclosure from a plain description, then checks its own work.
> A provisional only secures a priority date for what it actually describes, and LLM drafts happily claim things the
> description never says. So after drafting, every claim element is matched against numbered paragraphs, and any number
> in a claim that appears nowhere in the description is flagged.
>
> Here is one unedited run and the five things it invented (a torque range, a material, dimensions, a promised "method
> and computer-readable medium", and a reference to a claim 14 that does not exist): https://ipatent.qnfo.org/example
>
> Nothing is stored unless you tick "keep a private copy"; there is no account. It runs on open-weights models on
> Cloudflare Workers AI; the source is public (QNFO/qnfo-workers, qnfo-ipatent). It is not legal advice and the support
> check is lexical, so synonyms can read as unsupported and copied wording can pass. I would value critique from patent
> practitioners on what the check should catch next.

Best window: Tuesday to Thursday, 14:00-16:00 UTC. Stay in the thread for the first two hours and answer every comment.

## 3. Reddit (owner posts; read each subreddit's self-promotion rule first, post as a contributor, not an ad)
- r/inventors: "I built a free checker for a common provisional-patent mistake: claims the description doesn't support. Here is a real run and what the AI got wrong."
- r/patentlaw (practitioners; ask for critique, never for clients): "An AI drafting experiment: a real provisional draft and the five things the model invented. What should an automated support check catch?"
- r/Entrepreneur or r/startups (only where self-promotion threads allow it): the same text as r/inventors.

## 4. Product Hunt (owner account; launch 00:01 PT on a Tuesday)
- Name: iPatent. Tagline (60 chars): "Provisional patent drafts that flag unsupported claims"
- Description: the Hacker News text, first two paragraphs. Gallery: `/og.jpg`, a screenshot of the support map, the example's "What the run got wrong" box.

## 5. LinkedIn long post (fleet posts the short text; this longer version is for the owner's own article if wanted)
> Most people file a provisional patent to "lock in a date". The date only covers what the provisional actually describes.
> I built iPatent to make that visible: it drafts a provisional from your description, then flags every claim element and
> every number the description never backs up. On a simple hinge, the AI invented a torque range, a rubber hardness and
> two dimensions, and promised a "computer-readable medium" for a drawer hinge. The check caught the claims; the rest is
> why every fact must come from the inventor. Free, private by default, not legal advice. https://ipatent.qnfo.org/example

## 6. Directories and listings (owner submits; most require an account or a CAPTCHA)
There's An AI For That, Futurepedia, Toolify, AlternativeTo (as an alternative to paid AI patent drafters), and the
"Show" or "tools" threads of patent and maker communities. Use the Product Hunt tagline and the example link.

## 7. Practitioner and press pitch (owner sends; one person at a time, a real reason tied to their work)
For patent bloggers and newsletters (for example IPWatchdog's guest-post desk) and university tech-transfer offices:
> I ran an AI provisional-drafting experiment and published the unedited output with every invented fact marked:
> https://ipatent.qnfo.org/example. The tool is free and stores nothing. I am looking for practitioners to tell me what
> an automated support check should catch, and would be glad to write up the findings for your readers.
