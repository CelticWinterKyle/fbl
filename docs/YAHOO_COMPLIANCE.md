# Yahoo Fantasy API: attribution and data retention

Status as of 2026-08-17.

Context: Yahoo closed self-serve Fantasy API access on 2026-07-27. Celtic
Winter Dev applied, was approved 2026-08-10, and executed the API Access and
Use Agreement via DocuSign the same day. Access was confirmed restored on
2026-08-17 (`/api/admin/yahoo-diagnose` returned scope OK and both stored
league keys readable). The agreement is therefore in force AND we are serving
Yahoo data, so the obligations below are live, not theoretical.

## 1. Attribution: SHIPPED

`components/DataAttribution.tsx` renders "Fantasy data provided by Yahoo
Fantasy" with a link back to Yahoo Fantasy, plus a non-affiliation line.

Rendered in:

| Surface | Scope |
|---|---|
| Global footer (`app/layout.tsx`) | Every page, all three platforms |
| Game Day (`GameDayContent`) | Platforms actually on screen |
| Dashboard (`DashboardContent`) | Platforms actually on screen |
| My Team (`MyTeamContent`) | Platforms actually on screen |
| Recap (`RecapContent`) | Platforms actually on screen |

OPEN: Yahoo's brand guidelines also call for their logo. That needs the
official asset from the developer portal's brand kit. Do not approximate or
redraw it. Add the asset, then swap the text label for the logo lockup in
`DataAttribution`.

OPEN: the credit links to Yahoo Fantasy generally, not to the specific league.
Yahoo's league metadata response carries a per-league `url`
(e.g. `football.fantasysports.yahoo.com/f1/936665`) which is not currently
plumbed through `PlatformLeagueData`. A per-league deep link would be a
stronger read of "link back" if the executed terms require it.

## 2. Retention: INVENTORY COMPLETE, CHANGES BLOCKED ON THE CONTRACT

One approved developer reports the agreement caps cached Yahoo data at 30
days. That figure is secondhand. **The executed PDF has not been read** (it is
attached to the 2026-08-10 DocuSign completion mail, and the Gmail connector
in use cannot download attachments). Nothing below should be changed until the
real clause is read, because the fix for the durable stores is user-visible.

### Ephemeral: compliant under any reading

Everything here expires far inside 30 days. `lib/cache.ts` adds a stale grace
of `min(ttl * 4, 1h)` on top of the logical TTL, which does not change the
picture.

| Key | TTL | Yahoo content |
|---|---|---|
| `unified:yahoo:v2:{leagueKey}:{week}` | 60s in game windows, else 15 min | matchups, teams, standings, roster slots |
| `history:v6:yahoo:{leagueKey}` | 7 days | multi-season league history (Trophy Case) |
| `ai:recap:v1:yahoo:{league}:{week}` | 8 days | AI text derived from Yahoo data |
| gameday narrative | 30 min | AI text derived from Yahoo data |
| roster caches | 5 min | rosters |
| `espnhealth:*`, `cron:lastrun:*` | 7 and 30 days | no Yahoo content |

### Durable, no expiry: this is the entire exposure

These are written through `kvSet` in `lib/tokenStore/index.ts` (line 82) and
`lib/leagueRegistry.ts`, neither of which sets `ex`. They live until the user
disconnects or deletes their account.

| Key | Contents | Yahoo-derived? |
|---|---|---|
| `tokens:yahoo:{userId}` | OAuth access + refresh tokens | Credentials, not Fantasy content |
| `league:{userId}` | Selected Yahoo league key | Yahoo identifier |
| `leagues:yahoo:{userId}` | List of Yahoo league keys | Yahoo identifiers |
| `myteam:yahoo:{leagueId}:{userId}` | `teamKey` + **`teamName`** | Yes: team name is Yahoo content |
| `registry:leagues` (hash) | platform, leagueId, userId, updatedAt | Yahoo identifiers |
| `startsit:log:{season}` (list, 2000 cap) | leagueKey, teamKey, week, **player names**, verdict | Yes: player data, retained all season |

Note `startsit:log` is capped by count (2000), never by age, and is read by
the not-yet-built scorer cron. It is the largest durable pool of Yahoo-derived
player data in the system.

### The decision that needs the contract

A blanket 30-day expiry on the durable keys would silently break the product:
a user who does not open the app for a month loses their team selection and
league list with no error, just an app that looks disconnected. Whether that
is required turns on whether the clause covers *Fantasy content* (team and
player names) or *all data obtained through the API* (including league keys).

Two candidate designs, to pick once the clause is read:

1. **Rolling TTL.** Every read refreshes the key's expiry. Active users are
   never affected; dormant connections age out. Needs a touch-on-read in
   `kvSet`/`kvGet` and a re-connect path that recovers gracefully.
2. **Content stripping.** Keep identifiers durable (league keys, team keys are
   pointers, arguably ours), expire the Yahoo *content* fields (`teamName`,
   the player names in `startsit:log`) on a 30-day sweep, and re-fetch them on
   next load. Smaller product impact, more code.

Design 1 is simpler; design 2 is likelier to match a clause aimed at content.

## 3. Also worth telling Yahoo

The access application described League Blitz as it exists today: free,
read-only, no affiliate relationship. If Phase B of `docs/ODDS_MONETIZATION_PLAN.md`
ever ships, that description stops being accurate and Yahoo should be told.

## Next actions

1. **Kyle:** download the executed PDF and put it where it can be read, so the
   retention clause can be quoted rather than guessed at.
2. Then: pick design 1 or 2 above, implement, and delete this uncertainty.
3. Get the Yahoo brand asset and finish the attribution lockup.
4. Delete `/api/admin/yahoo-diagnose` now that access is restored.
