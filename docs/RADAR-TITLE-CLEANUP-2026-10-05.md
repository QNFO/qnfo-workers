# Radar title cleanup 2026-10-05 (RADAR-TITLE-NOISE-2, #1885, pillar: personal)

Scope: `qnfo-audit.calendar` rows with `plane='personal' AND source='personal-radar'` whose stored title holds the noise patterns
fixed in radar-hub 1.2.4 (inline dates or date ranges, `opslaan` / `Dit evenement opslaan` / `Indeling Prijs Taal Valuta` / `Next page` /
`Upcoming exhibitions` / `Accessibility facilities` chrome, cut-word or `&` fragments at Stedelijk, Iamsterdam and EventbriteLGBTQ).
Only the `title` column changes. Dedupe key (location + dtstart) is untouched, so nothing is re-posted. Every UPDATE is guarded by the
row id and the exact old title, so a row someone edited since is skipped (0 changes).

Not touched: row 118 (already clean), row 120 (`sale 7 . Speed dating 8 ...`, a pure navigation list with no recoverable title),
and all rows of other venues.

Titles for rows 73, 75, 114, 116, 117, 119 are the segment directly before the row's own dtstart (the code skips such cut candidates).

## Before state (id | old title)

- 64 | EventbriteLGBTQ: Amsterdam Dit evenement opslaan: Pride Tour in Amsterdam SIPS & SORCERY Thu, Sep 10, 8:00
- 65 | Stedelijk: Page 3 Page 4 Page 5 Page 6 Page 7 Next page Upcoming exhibitions Yayoi Kusama Sep 11,
- 66 | EventbriteLGBTQ: opslaan: Out in Tech Amsterdam | Third Thursdays IBC Pride Happy Hour Fri, Sep 11, 5:00
- 67 | Stedelijk: Stedelijk Kids Festival Yayoi Kusama Events Every Saturday and Sunday from Sep 12
- 69 | EventbriteLGBTQ: & SORCERY Dit evenement opslaan: SIPS & SORCERY Opening Zanele Muholi Sat, Sep 12, 3:00
- 71 | EventbriteLGBTQ: opslaan: Casual Queer Networking- Potluck SUNDAYS QUEER MAKEUP CLUB Sun, Sep 13, 1:30 PM
- 73 | EventbriteLGBTQ: nature connection for LGBTQ+ Out in Tech Amsterdam | Third Thursdays Thu, Sep 17, 6:00 PM
- 75 | EventbriteLGBTQ: & Podcast Launch Funny Women Amsterdam Presents: Comedy & Games Night! Sat, Sep 19, 8:00
- 76 | EventbriteLGBTQ: opslaan: Drag Bingo Royale FORWARD Dentons Pride Padel Event 2026 Thu, Sep 24, 6:00 PM
- 78 | EventbriteLGBTQ: Indeling Prijs Taal Valuta Touch grass: nature connection for LGBTQ+ Sun, Oct 4, 1:00 PM
- 79 | EventbriteLGBTQ: Amsterdam | Sing Your Queer Heart Out! Casual Queer Networking- Potluck Thu, Oct 8, 2:00
- 80 | EventbriteLGBTQ: History, Nightlife & Beyond Off Campus VS Heated Rivalry (Amsterdam) Fri, Oct 9, 11:00 PM
- 82 | Stedelijk: Sep 11, 2026 till Jan 17, 2027 Adam Pendleton Some Wild Kind of Language October 10, 2026
- 83 | EventbriteLGBTQ: Opening Zanele Muholi Queer Parenthood Conference & Podcast Launch Sat, Oct 10, 1:30 PM
- 92 | EventbriteLGBTQ: opslaan: Casual Queer Networking- Potluck Pride Almere Diner 2026 Wed, Oct 7, 6:30 PM
- 93 | EventbriteLGBTQ: opslaan: Opening Zanele Muholi OIT Amsterdam | Self-Defense Workshop Sat, Sep 26, 2:00 PM
- 113 | Stedelijk: 2027 Collaborative Artistic Practices - Proposals for the Museum Collection Nov 28, 2026
- 114 | Stedelijk: than 500 works from 1870 until now Ongoing Kho Liang Ie Mid-Century Modernist May 14 till
- 115 | Stedelijk: the Museum Collection Nov 28, 2026 till Apr 4, 2027 LUC TUYMANS SILENT MUSIC Mar 6 till
- 116 | Stedelijk: SILENT MUSIC Mar 6 till Jul 11, 2027 ABN AMRO ART AWARD 2026 HEND SAMIR Mar 19 till
- 117 | Stedelijk: ART AWARD 2026 HEND SAMIR Mar 19 till Jun 20, 2027 Ibrahim Mahama Zilijafa Mar 21 till
- 119 | Iamsterdam: Art and Design Accessibility facilities Tickets Available 12 nov '26 - 22 nov '26 IDFA:

## Forward SQL

```sql
UPDATE calendar SET title='EventbriteLGBTQ: Pride Tour in Amsterdam SIPS & SORCERY' WHERE id=64 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Amsterdam Dit evenement opslaan: Pride Tour in Amsterdam SIPS & SORCERY Thu, Sep 10, 8:00';
UPDATE calendar SET title='Stedelijk: Yayoi Kusama' WHERE id=65 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: Page 3 Page 4 Page 5 Page 6 Page 7 Next page Upcoming exhibitions Yayoi Kusama Sep 11,';
UPDATE calendar SET title='EventbriteLGBTQ: Out in Tech Amsterdam | Third Thursdays IBC Pride Happy Hour' WHERE id=66 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: opslaan: Out in Tech Amsterdam | Third Thursdays IBC Pride Happy Hour Fri, Sep 11, 5:00';
UPDATE calendar SET title='Stedelijk: Kids Festival Yayoi Kusama Events' WHERE id=67 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: Stedelijk Kids Festival Yayoi Kusama Events Every Saturday and Sunday from Sep 12';
UPDATE calendar SET title='EventbriteLGBTQ: SIPS & SORCERY Opening Zanele Muholi' WHERE id=69 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: & SORCERY Dit evenement opslaan: SIPS & SORCERY Opening Zanele Muholi Sat, Sep 12, 3:00';
UPDATE calendar SET title='EventbriteLGBTQ: Casual Queer Networking- Potluck SUNDAYS QUEER MAKEUP CLUB' WHERE id=71 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: opslaan: Casual Queer Networking- Potluck SUNDAYS QUEER MAKEUP CLUB Sun, Sep 13, 1:30 PM';
UPDATE calendar SET title='EventbriteLGBTQ: Out in Tech Amsterdam | Third Thursdays' WHERE id=73 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: nature connection for LGBTQ+ Out in Tech Amsterdam | Third Thursdays Thu, Sep 17, 6:00 PM';
UPDATE calendar SET title='EventbriteLGBTQ: Funny Women Amsterdam Presents: Comedy & Games Night!' WHERE id=75 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: & Podcast Launch Funny Women Amsterdam Presents: Comedy & Games Night! Sat, Sep 19, 8:00';
UPDATE calendar SET title='EventbriteLGBTQ: Drag Bingo Royale FORWARD Dentons Pride Padel Event 2026' WHERE id=76 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: opslaan: Drag Bingo Royale FORWARD Dentons Pride Padel Event 2026 Thu, Sep 24, 6:00 PM';
UPDATE calendar SET title='EventbriteLGBTQ: Touch grass: nature connection for LGBTQ+' WHERE id=78 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Indeling Prijs Taal Valuta Touch grass: nature connection for LGBTQ+ Sun, Oct 4, 1:00 PM';
UPDATE calendar SET title='EventbriteLGBTQ: Sing Your Queer Heart Out! Casual Queer Networking- Potluck' WHERE id=79 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Amsterdam | Sing Your Queer Heart Out! Casual Queer Networking- Potluck Thu, Oct 8, 2:00';
UPDATE calendar SET title='EventbriteLGBTQ: History, Nightlife & Beyond Off Campus VS Heated Rivalry (Amsterdam)' WHERE id=80 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: History, Nightlife & Beyond Off Campus VS Heated Rivalry (Amsterdam) Fri, Oct 9, 11:00 PM';
UPDATE calendar SET title='Stedelijk: Adam Pendleton Some Wild Kind of Language' WHERE id=82 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: Sep 11, 2026 till Jan 17, 2027 Adam Pendleton Some Wild Kind of Language October 10, 2026';
UPDATE calendar SET title='EventbriteLGBTQ: Opening Zanele Muholi Queer Parenthood Conference & Podcast Launch' WHERE id=83 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Opening Zanele Muholi Queer Parenthood Conference & Podcast Launch Sat, Oct 10, 1:30 PM';
UPDATE calendar SET title='EventbriteLGBTQ: Casual Queer Networking- Potluck Pride Almere Diner 2026' WHERE id=92 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: opslaan: Casual Queer Networking- Potluck Pride Almere Diner 2026 Wed, Oct 7, 6:30 PM';
UPDATE calendar SET title='EventbriteLGBTQ: Opening Zanele Muholi OIT Amsterdam | Self-Defense Workshop' WHERE id=93 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: opslaan: Opening Zanele Muholi OIT Amsterdam | Self-Defense Workshop Sat, Sep 26, 2:00 PM';
UPDATE calendar SET title='Stedelijk: 2027 Collaborative Artistic Practices - Proposals for the Museum Collection' WHERE id=113 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: 2027 Collaborative Artistic Practices - Proposals for the Museum Collection Nov 28, 2026';
UPDATE calendar SET title='Stedelijk: Kho Liang Ie Mid-Century Modernist' WHERE id=114 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: than 500 works from 1870 until now Ongoing Kho Liang Ie Mid-Century Modernist May 14 till';
UPDATE calendar SET title='Stedelijk: LUC TUYMANS SILENT MUSIC' WHERE id=115 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: the Museum Collection Nov 28, 2026 till Apr 4, 2027 LUC TUYMANS SILENT MUSIC Mar 6 till';
UPDATE calendar SET title='Stedelijk: ABN AMRO ART AWARD 2026 HEND SAMIR' WHERE id=116 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: SILENT MUSIC Mar 6 till Jul 11, 2027 ABN AMRO ART AWARD 2026 HEND SAMIR Mar 19 till';
UPDATE calendar SET title='Stedelijk: Ibrahim Mahama Zilijafa' WHERE id=117 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: ART AWARD 2026 HEND SAMIR Mar 19 till Jun 20, 2027 Ibrahim Mahama Zilijafa Mar 21 till';
UPDATE calendar SET title='Iamsterdam: IDFA' WHERE id=119 AND plane='personal' AND source='personal-radar' AND title='Iamsterdam: Art and Design Accessibility facilities Tickets Available 12 nov ''26 - 22 nov ''26 IDFA:';
```

## Revert SQL

```sql
UPDATE calendar SET title='EventbriteLGBTQ: Amsterdam Dit evenement opslaan: Pride Tour in Amsterdam SIPS & SORCERY Thu, Sep 10, 8:00' WHERE id=64 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Pride Tour in Amsterdam SIPS & SORCERY';
UPDATE calendar SET title='Stedelijk: Page 3 Page 4 Page 5 Page 6 Page 7 Next page Upcoming exhibitions Yayoi Kusama Sep 11,' WHERE id=65 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: Yayoi Kusama';
UPDATE calendar SET title='EventbriteLGBTQ: opslaan: Out in Tech Amsterdam | Third Thursdays IBC Pride Happy Hour Fri, Sep 11, 5:00' WHERE id=66 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Out in Tech Amsterdam | Third Thursdays IBC Pride Happy Hour';
UPDATE calendar SET title='Stedelijk: Stedelijk Kids Festival Yayoi Kusama Events Every Saturday and Sunday from Sep 12' WHERE id=67 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: Kids Festival Yayoi Kusama Events';
UPDATE calendar SET title='EventbriteLGBTQ: & SORCERY Dit evenement opslaan: SIPS & SORCERY Opening Zanele Muholi Sat, Sep 12, 3:00' WHERE id=69 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: SIPS & SORCERY Opening Zanele Muholi';
UPDATE calendar SET title='EventbriteLGBTQ: opslaan: Casual Queer Networking- Potluck SUNDAYS QUEER MAKEUP CLUB Sun, Sep 13, 1:30 PM' WHERE id=71 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Casual Queer Networking- Potluck SUNDAYS QUEER MAKEUP CLUB';
UPDATE calendar SET title='EventbriteLGBTQ: nature connection for LGBTQ+ Out in Tech Amsterdam | Third Thursdays Thu, Sep 17, 6:00 PM' WHERE id=73 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Out in Tech Amsterdam | Third Thursdays';
UPDATE calendar SET title='EventbriteLGBTQ: & Podcast Launch Funny Women Amsterdam Presents: Comedy & Games Night! Sat, Sep 19, 8:00' WHERE id=75 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Funny Women Amsterdam Presents: Comedy & Games Night!';
UPDATE calendar SET title='EventbriteLGBTQ: opslaan: Drag Bingo Royale FORWARD Dentons Pride Padel Event 2026 Thu, Sep 24, 6:00 PM' WHERE id=76 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Drag Bingo Royale FORWARD Dentons Pride Padel Event 2026';
UPDATE calendar SET title='EventbriteLGBTQ: Indeling Prijs Taal Valuta Touch grass: nature connection for LGBTQ+ Sun, Oct 4, 1:00 PM' WHERE id=78 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Touch grass: nature connection for LGBTQ+';
UPDATE calendar SET title='EventbriteLGBTQ: Amsterdam | Sing Your Queer Heart Out! Casual Queer Networking- Potluck Thu, Oct 8, 2:00' WHERE id=79 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Sing Your Queer Heart Out! Casual Queer Networking- Potluck';
UPDATE calendar SET title='EventbriteLGBTQ: History, Nightlife & Beyond Off Campus VS Heated Rivalry (Amsterdam) Fri, Oct 9, 11:00 PM' WHERE id=80 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: History, Nightlife & Beyond Off Campus VS Heated Rivalry (Amsterdam)';
UPDATE calendar SET title='Stedelijk: Sep 11, 2026 till Jan 17, 2027 Adam Pendleton Some Wild Kind of Language October 10, 2026' WHERE id=82 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: Adam Pendleton Some Wild Kind of Language';
UPDATE calendar SET title='EventbriteLGBTQ: Opening Zanele Muholi Queer Parenthood Conference & Podcast Launch Sat, Oct 10, 1:30 PM' WHERE id=83 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Opening Zanele Muholi Queer Parenthood Conference & Podcast Launch';
UPDATE calendar SET title='EventbriteLGBTQ: opslaan: Casual Queer Networking- Potluck Pride Almere Diner 2026 Wed, Oct 7, 6:30 PM' WHERE id=92 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Casual Queer Networking- Potluck Pride Almere Diner 2026';
UPDATE calendar SET title='EventbriteLGBTQ: opslaan: Opening Zanele Muholi OIT Amsterdam | Self-Defense Workshop Sat, Sep 26, 2:00 PM' WHERE id=93 AND plane='personal' AND source='personal-radar' AND title='EventbriteLGBTQ: Opening Zanele Muholi OIT Amsterdam | Self-Defense Workshop';
UPDATE calendar SET title='Stedelijk: 2027 Collaborative Artistic Practices - Proposals for the Museum Collection Nov 28, 2026' WHERE id=113 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: 2027 Collaborative Artistic Practices - Proposals for the Museum Collection';
UPDATE calendar SET title='Stedelijk: than 500 works from 1870 until now Ongoing Kho Liang Ie Mid-Century Modernist May 14 till' WHERE id=114 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: Kho Liang Ie Mid-Century Modernist';
UPDATE calendar SET title='Stedelijk: the Museum Collection Nov 28, 2026 till Apr 4, 2027 LUC TUYMANS SILENT MUSIC Mar 6 till' WHERE id=115 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: LUC TUYMANS SILENT MUSIC';
UPDATE calendar SET title='Stedelijk: SILENT MUSIC Mar 6 till Jul 11, 2027 ABN AMRO ART AWARD 2026 HEND SAMIR Mar 19 till' WHERE id=116 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: ABN AMRO ART AWARD 2026 HEND SAMIR';
UPDATE calendar SET title='Stedelijk: ART AWARD 2026 HEND SAMIR Mar 19 till Jun 20, 2027 Ibrahim Mahama Zilijafa Mar 21 till' WHERE id=117 AND plane='personal' AND source='personal-radar' AND title='Stedelijk: Ibrahim Mahama Zilijafa';
UPDATE calendar SET title='Iamsterdam: Art and Design Accessibility facilities Tickets Available 12 nov ''26 - 22 nov ''26 IDFA:' WHERE id=119 AND plane='personal' AND source='personal-radar' AND title='Iamsterdam: IDFA';
```
