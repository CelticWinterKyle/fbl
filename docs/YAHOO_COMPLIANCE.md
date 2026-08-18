# Yahoo Fantasy API: what the executed agreement actually requires

Read against the executed PDF on 2026-08-18. Supersedes the 2026-08-17 version
of this file, which was written from a secondhand Reddit summary and got the
central term wrong.

Agreement: "API Access and Use Agreement", Docusign envelope
57C68381-9F82-8A0E-8374-28F03F73FBC9. Effective Date **August 7, 2026**.
Developer: Celtic Winter Dev (Kyle Wright, Founder). Territory: **United States
and Canada**. API Access: **Read-Only**. Governing law: New York.
Approved Use Case, verbatim:

> Developer requesting read-only access to the Yahoo Fantasy API to read league
> metadata, scoreboards, and rosters for the purpose of presenting a unified
> dashboard and weekly recap in League Blitz.

Not a lawyer, and several items below are judgment calls that may want one.
Section numbers refer to Exhibit A unless noted.

---

## 1. The handoff's "30 days" was wrong, in both directions

HANDOFF.md said the agreement "carries specific limits on storing/caching Yahoo
data, with cached data to be deleted within 30 days". Neither half is right.

**Caching is not time-limited. It is prohibited outright.** Section 2.c.vii:

> Developer shall not store, cache or index the Yahoo Fantasy Information.

**The 30 days is a different clause about AI**, section 3.e, and it is stricter
than a retention cap: it also assigns ownership. See section 3 below.

## 2. Caching: the app is built on something the contract forbids (DECISION NEEDED)

Section 2.c.vii is flat. "Yahoo Fantasy Information" is defined as *any*
information retrieved from the Yahoo Fantasy Database (1.e), so it covers
matchups, scores, team names, standings, rosters, and league metadata.

What the app does today:

| Store | Lifetime | Status under 2.c.vii |
|---|---|---|
| `unified:yahoo:v2:{league}:{week}` | 60s live, 15 min otherwise | Caching |
| `history:v6:yahoo:{league}` | 7 days | Caching |
| `myteam:yahoo:*` (teamName) | Forever | Caching, indefinitely |
| `leagues:yahoo:*`, `league:{userId}` | Forever | League keys, indefinitely |
| `registry:leagues` | Forever | League keys, indefinitely |

There is real tension inside the document. Section 2.c.v *requires* the app to
be designed around rate limits ("Developer is responsible for designing the
Developer Application to handle rate limiting"), and section 2.c.vi forbids
request volumes that load the database excessively. Serving live scores to
multiple users with no cache at all pushes toward exactly the abusive request
volume those clauses prohibit. A literal zero-cache reading and the rate-limit
clauses cannot both be satisfied.

That tension is arguable for a 60-second live-score cache. It is **not**
arguable for the indefinite stores: a team name kept forever is storage by any
reading, and the app works fine re-fetching it.

**DECIDED 2026-08-18 (Kyle):** retain Yahoo data for the season, on the
section 13 reasonableness standard rather than a literal reading of 2.c.vii.
The Approved Use Case is a season-long dashboard and weekly recap, so a season
of retention is what supporting it requires. Decision recorded here so it is
reviewable if Yahoo ever asks. Kyle also chose not to send Yahoo a written
question about it; that option stays open and stays cheap.

Implemented under that decision:

| Store | Before | Now |
|---|---|---|
| `league:{userId}` | Forever | 270-day expiry |
| `leagues:yahoo:{userId}` | Forever | 270-day expiry |
| `myteam:yahoo:*` | Forever | 270-day expiry |
| `registry:leagues` (Yahoo rows) | Forever | Pruned on read past the window |
| `tokens:yahoo:*` | Forever | Unchanged, deliberately: a credential is not Yahoo Fantasy Information (1.e), and expiring it signs users out |
| Sleeper and ESPN stores | Forever | Unchanged: not covered by this agreement |

The window is `YAHOO_RETENTION_S` in `lib/retention.ts`, 270 days, chosen so a
connection made at any point in a season survives that whole season and expires
before the next one opens. `tests/retention.test.ts` locks both properties.

Nothing Yahoo-derived is kept indefinitely any more, which was the part that
had no defense under any reading.

## 3. AI Tools, section 3.e: the sleeper clause (ONE FIX SHIPPED)

> all Yahoo Materials, Yahoo Fantasy Information and Yahoo Confidential
> Information entered into the Developer Application for processing by the AI
> Tools ("Input") and all of the output returned by the AI Tool ("Output")
> shall belong exclusively to Yahoo. Developer shall at all times: (a) not use,
> and not permit any third party to use, [the same] for the purpose of
> training, grounding, or otherwise improving any AI Tool; (b) delete all Input
> and Outputs generated within the Developer Application upon request and/or at
> reasonable and regular intervals (in no event longer than 30 days)

This reaches every AI feature: matchup analysis, trade analyzer, start/sit
advisor, recap narrative, Game Day narrative.

| Store | Was | Now |
|---|---|---|
| `startsit:log:{season}` | Season-long, capped by count (2000), never by age | **FIXED**: bucketed per week, each bucket expires 30 days after its first write |
| `ai:recap:v1:*` | 8 days | Compliant |
| Game Day narrative | 30 min | Compliant |
| Start/sit verdict cache | 1 hour | Compliant |

Consequences worth knowing:

- **"Coach is 14-9 this season" cannot be built the way it was planned.**
  docs/AI_COACH_PLAN.md assumed a season-long verdict log to grade against.
  That log now expires every 30 days. The feature survives only if the running
  record is kept as **aggregate counters holding no Yahoo Fantasy Information**
  (wins, losses, lean distribution), with the per-verdict records deleted on
  schedule. Build the scorer that way.
- **Output belongs to Yahoo.** Every AI recap and trade verdict derived from
  Yahoo data is Yahoo's property, not League Blitz's. That matters if any of it
  is ever republished, sold, or used as a differentiator.
- **"not permit any third party to use ... for training."** Inputs go to
  OpenAI. OpenAI's API default is no training on API data, which is the
  defense, but it rests on their policy, not on our code.

## 4. Gambling, section 2.c.iii: this hits the monetization plan (DECISION NEEDED)

> Developer may not use the Yahoo Materials to build, operate, or support any
> application, service, or content that is illegal, deceptive, harmful, or that
> violates applicable law or third-party rights. This includes, without
> limitation, uses involving: ... **gambling or unlicensed financial services**
> ... Yahoo reserves the right to determine, in its sole discretion, whether a
> use violates this section.

docs/ODDS_MONETIZATION_PLAN.md Phase B is sportsbook affiliate revenue, and per
memory that path was chosen deliberately in June 2026 as the primary business
model. The odds tab already ships as content-only (Phase A), which is the
defensible side of the line.

The problem is "**support**" plus "**sole discretion**". An app that displays
Yahoo league data and also sends users to sportsbooks for money is, on Yahoo's
reading and Yahoo's call alone, a Yahoo-fed application supporting gambling.
The remedy under section 6 is that Yahoo may terminate "immediately for any
reason or for no reason".

This is not a code problem, it is a strategy collision, and it wants a decision
before Phase B paperwork starts:

- Ship Phase B and accept that Yahoo access can be pulled at their discretion,
  which means Yahoo leagues stop working for every user who has one; or
- Keep odds content-only while Yahoo data is in the product; or
- Ask Yahoo directly. The application described League Blitz as free with no
  affiliate relationship, so if that changes they arguably need telling anyway.

## 5. Smaller items, in descending risk

- **Section 2.c.x, no complete stats.** Forbids presenting "complete
  statistics for any players in the League, all players on any League team
  (unless all such players are also on a User's fantasy team) or all players in
  a fantasy league". The Pickups panel surfaces league-wide Yahoo availability,
  which is the closest thing in the app to "all players in a fantasy league".
  Worth a look at what it actually renders for Yahoo.
- **Section 5, display only within the app.** "Developer shall display Yahoo
  Fantasy Information only within the Developer Application." `/share/*` is a
  public route rendering team names, records, and points from the URL. The page
  itself is on leagueblitz.app, so it is arguably inside the Developer
  Application; the OG preview card embedded into a social post is arguably not.
- **Section 13, Historical Data.** Yahoo data received under the old
  self-serve terms is now bound by this agreement too, and may not be retained
  "longer than is reasonably necessary to support the Approved Use Case". The
  Trophy Case walks back multiple seasons of Yahoo league history.
- **Approved Use Case is narrow.** It authorizes "a unified dashboard and
  weekly recap". Section 1.c excludes any other purpose including "profiling,
  data enrichment, model training, or resale" unless approved in writing. Trade
  analysis, start/sit advice, and waiver intel are plausibly "data enrichment"
  rather than dashboard or recap.
- **Territory is US and Canada.** leagueblitz.app serves everyone.
- **Section 6, termination.** On termination, all Yahoo Materials and Yahoo
  Fantasy Information must be deleted from systems and servers within ten
  business days. There is no runbook for that today. It would be a KV sweep of
  every key listed in section 2 above.
- **Section 3.d, breach notification.** Any security breach touching Yahoo
  Materials must be reported to Yahoo within 48 hours.
- **Section 7, privacy policy.** Requires a "clearly and conspicuously stated
  privacy policy" that the app's data collection actually complies with. Check
  /privacy covers the Yahoo handling described here.

## 6. Attribution: SHIPPED, and verified against the real wording

The cover page requires, for web applications:

> attribution must appear in the footer of each page where Yahoo Fantasy
> Information is displayed and must include a hyperlink to an official Yahoo
> Fantasy webpage

`components/DataAttribution.tsx` renders "Fantasy data provided by Yahoo
Fantasy" (the cover page's own example phrasing) in the global footer of every
page, hyperlinked to football.fantasysports.yahoo.com, plus on Game Day,
Dashboard, My Team, and Recap. **This satisfies the clause as written.**

Two corrections to earlier assumptions:

- **Do NOT add the Yahoo logo.** The previous note here said the brand
  guidelines require it. Section 16 says the opposite: Developer "shall not use
  the Yahoo corporate name or any of Yahoo's brand names, trademarks, service
  marks or stylized logos for any purpose without expressed written consent in
  each instance". Shipping without the logo was correct.
- **Still missing: the app store line.** The cover page requires that if Yahoo
  Fantasy Information is a material feature, the app store description contain
  "This application uses fantasy data provided by Yahoo Fantasy." The Chrome
  Web Store listing for the League Blitz extension does not say this. Add it.

One thing to review: the shipped line ends "League Blitz is not affiliated with
or endorsed by Yahoo, Sleeper, or ESPN." That is protective and standard, but
section 16 permits only the cover-page attribution without written consent.
Defensible as a disclaimer rather than a statement about the relationship;
flagging it rather than removing it unilaterally.

## Next actions

1. ~~Phase B gambling collision~~ **DECIDED 2026-08-18: sportsbook affiliate is
   ON HOLD.** Neither book ever replied to the applications, so nothing was
   given up. Phase A (odds as content, no link-outs) stays live and is the
   compliant side of section 2.c.iii. Revisit only with this clause in hand.
2. ~~Caching posture~~ DECIDED, see section 2.
3. Build the start/sit scorer on aggregate counters, not retained verdicts.
4. Add the Chrome Web Store attribution line.
5. Write the termination runbook (section 6): one sweep that deletes every
   Yahoo key listed above.
6. Delete `/api/admin/yahoo-diagnose`.
7. Still open, lower risk: the Pickups panel against 2.c.x, `/share/*` against
   section 5, Trophy Case history against section 13, Territory (US/Canada).
