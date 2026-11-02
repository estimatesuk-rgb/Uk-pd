# Grassroots Eleven — Division One free pilot

**Pilot status:** proposal only; do not invite clubs to use official digital sheets until the league authorizes them and the production checks pass.

## Purpose
Show the league committee and all nine Division One clubs the full journey from club access through squad administration, matchday selection, team sheet submission and referee review. **Free of charge** during the pilot. Keep existing league paper/FA procedures in place; digital output is supplementary until expressly approved.

## Clubs
Bolsover Town Seniors; Brampton Moor Rovers; Brampton Rovers AFC; Butchers Arms; Clowne Wanderers; Doe Lea AFC; Eyam AFC; Langwith Whitestar; Tibshelf Seniors.

## Walkthrough for league representative
1. Open public directory and show six divisions and 60 official handbook clubs; explain that private secretary contacts are protected.
2. Show a single authenticated Division One club account. Enter draft player details; explain draft is not official FA registration.
3. Import only club-approved, verified player and fixture data before live matchday use. Demonstrate eligibility and suspension restrictions.
4. Create a team sheet with exactly 11 starters, allowable substitutes and unique shirt numbers.
5. Show referee access, matchday confirmation and the post-match substitute-played record.
6. Compare digital record against the official team sheet and collect feedback.

## Pilot operations
- Appoint one league coordinator and one club representative per participating club.
- Trial one friendly or historical test fixture first, using non-sensitive test data.
- Run digital records alongside the official paperwork for at least two matchweeks.
- Keep player personal data accessible only to authorized club and league roles.
- Record issues by severity, affected screen, device, and reproduction steps; do not share passwords.
- Obtain consent/appropriate lawful basis and a clear retention policy before storing personal player details. Additional safeguards apply to minors.
- Do not enable live SMS, WhatsApp bulk messaging, or player availability tracking without appropriate consent and an approved communications provider.

## Pilot success measures
- Nine clubs offered onboarding; track actual clubs activated separately.
- Successful sign-in and isolation between club accounts.
- Verified registrations and fixture source confirmed.
- Accurate matchday shirt numbers, starters, substitutes and attendance.
- Referee and manager usability on mobile.
- Zero critical security or privacy issues.
- League approval before replacing any mandated paperwork.

## Future modules (not part of current build)
- Player availability requests, group communications, drag-and-drop pitch formation and WhatsApp lineup image sharing.
- League fixture generation and referee assignment, including flagged high-risk fixtures and independent assistant referees. These require league oversight, careful privacy handling and fairness safeguards.

## Production blockers as of 2026-11-02
- Render API has no DATABASE_URL configured, so database tables, club import and authenticated workflows have not been verified live.
- Club accounts have not been provisioned, and verified player/fixture data has not been imported.
- The free Render PostgreSQL instance has a scheduled expiration in December 2026; decide on durable hosting and backups before real records are collected.
