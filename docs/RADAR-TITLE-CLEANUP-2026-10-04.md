# RADAR-TITLE-NOISE-1 one-off cleanup (2026-10-04)

Charter pillar: personal. Seven rows in `qnfo-audit.calendar` (plane personal, source personal-radar) whose key location|dtstart appears in a live scan with the 1.2.3 extractor and whose stored title carries page chrome or a cut-off fragment. Only `title` changes; every UPDATE is guarded by the exact old title, so it is a no-op if the row changed. Rows from Eventbrite, Stedelijk and older Concertgebouw scans could not be re-derived today (the venue page was unreachable or no longer lists them) and are left alone.

## Before state

| id | row | old title | new title |
|---|---|---|---|
| 81 | VanGoghMuseum 2026-10-10 | VanGoghMuseum: works up close and tick everything off the list. Celebrate Autumn Break 10 October 2026 -  | VanGoghMuseum: Celebrate Autumn Break |
| 108 | Rijksmuseum 2026-10-09 | Rijksmuseum: Drawing Book Till 29 november Now on view Willem de Kooning at work From 9 October | Rijksmuseum: Willem de Kooning at work |
| 109 | VanGoghMuseum 2026-10-26 | VanGoghMuseum: up close and tick everything off the list. Celebrate Autumn Break 10 October 2026 - 18 | VanGoghMuseum: Celebrate Autumn Break |
| 110 | VanGoghMuseum 2026-10-23 | VanGoghMuseum: you into Whistler’s world. ADE x Van Gogh Museum: Coby Sey and Devon Rexi 23 October 2026 | VanGoghMuseum: ADE x Van Gogh Museum: Coby Sey and Devon Rexi |
| 111 | VanGoghMuseum 2026-10-18 | VanGoghMuseum: and tick everything off the list. Celebrate Autumn Break 10 October 2026 - 18 October | VanGoghMuseum: Celebrate Autumn Break |
| 112 | VanGoghMuseum 2026-10-16 | VanGoghMuseum: packed with art, music, workshops, tours and live acts. Whistler Tours From 16 October | VanGoghMuseum: Whistler Tours |
| 118 | Iamsterdam 2026-11-12 | Iamsterdam: and Contemporary Art and Design Accessibility facilities Tickets Available 12 nov '26 - | Iamsterdam: Yayoi Kusama |

## Apply

```sql
UPDATE calendar SET title='VanGoghMuseum: Celebrate Autumn Break' WHERE id=81 AND plane='personal' AND source='personal-radar' AND title='VanGoghMuseum: works up close and tick everything off the list. Celebrate Autumn Break 10 October 2026 - ';
UPDATE calendar SET title='Rijksmuseum: Willem de Kooning at work' WHERE id=108 AND plane='personal' AND source='personal-radar' AND title='Rijksmuseum: Drawing Book Till 29 november Now on view Willem de Kooning at work From 9 October';
UPDATE calendar SET title='VanGoghMuseum: Celebrate Autumn Break' WHERE id=109 AND plane='personal' AND source='personal-radar' AND title='VanGoghMuseum: up close and tick everything off the list. Celebrate Autumn Break 10 October 2026 - 18';
UPDATE calendar SET title='VanGoghMuseum: ADE x Van Gogh Museum: Coby Sey and Devon Rexi' WHERE id=110 AND plane='personal' AND source='personal-radar' AND title='VanGoghMuseum: you into Whistler’s world. ADE x Van Gogh Museum: Coby Sey and Devon Rexi 23 October 2026';
UPDATE calendar SET title='VanGoghMuseum: Celebrate Autumn Break' WHERE id=111 AND plane='personal' AND source='personal-radar' AND title='VanGoghMuseum: and tick everything off the list. Celebrate Autumn Break 10 October 2026 - 18 October';
UPDATE calendar SET title='VanGoghMuseum: Whistler Tours' WHERE id=112 AND plane='personal' AND source='personal-radar' AND title='VanGoghMuseum: packed with art, music, workshops, tours and live acts. Whistler Tours From 16 October';
UPDATE calendar SET title='Iamsterdam: Yayoi Kusama' WHERE id=118 AND plane='personal' AND source='personal-radar' AND title='Iamsterdam: and Contemporary Art and Design Accessibility facilities Tickets Available 12 nov ''26 -';
```

## Revert

```sql
UPDATE calendar SET title='VanGoghMuseum: works up close and tick everything off the list. Celebrate Autumn Break 10 October 2026 - ' WHERE id=81 AND plane='personal' AND source='personal-radar' AND title='VanGoghMuseum: Celebrate Autumn Break';
UPDATE calendar SET title='Rijksmuseum: Drawing Book Till 29 november Now on view Willem de Kooning at work From 9 October' WHERE id=108 AND plane='personal' AND source='personal-radar' AND title='Rijksmuseum: Willem de Kooning at work';
UPDATE calendar SET title='VanGoghMuseum: up close and tick everything off the list. Celebrate Autumn Break 10 October 2026 - 18' WHERE id=109 AND plane='personal' AND source='personal-radar' AND title='VanGoghMuseum: Celebrate Autumn Break';
UPDATE calendar SET title='VanGoghMuseum: you into Whistler’s world. ADE x Van Gogh Museum: Coby Sey and Devon Rexi 23 October 2026' WHERE id=110 AND plane='personal' AND source='personal-radar' AND title='VanGoghMuseum: ADE x Van Gogh Museum: Coby Sey and Devon Rexi';
UPDATE calendar SET title='VanGoghMuseum: and tick everything off the list. Celebrate Autumn Break 10 October 2026 - 18 October' WHERE id=111 AND plane='personal' AND source='personal-radar' AND title='VanGoghMuseum: Celebrate Autumn Break';
UPDATE calendar SET title='VanGoghMuseum: packed with art, music, workshops, tours and live acts. Whistler Tours From 16 October' WHERE id=112 AND plane='personal' AND source='personal-radar' AND title='VanGoghMuseum: Whistler Tours';
UPDATE calendar SET title='Iamsterdam: and Contemporary Art and Design Accessibility facilities Tickets Available 12 nov ''26 -' WHERE id=118 AND plane='personal' AND source='personal-radar' AND title='Iamsterdam: Yayoi Kusama';
```
