# League Blitz — Session Handoff (2026-06-01)

A working handoff for the next session. Covers what shipped, the strategic
decisions made, the monetization direction, the full feature inventory, and the
recommended next steps. Read this first.

---

## 1. What shipped this session (all committed + pushed to `main`)

| Commit | What |
|--------|------|
| `e047c66` | Swept every emoji out of the UI, replaced with lucide-react / inline SVG |
| `eb09d4c` | New **Live Feed** page (`/feed`): consolidated multi-league scoring |
| `fa30ffd` | **Play-by-play layer**: real NFL plays, yardage, working Touchdowns filter |
| `8e0d73e` | Centered the feed content column (`mx-auto`) |

All build clean (`tsc` + `next build`) and are live on Vercel.

---

## 2. The Live Feed — current state

**What it is:** a cross-league live scoring feed at `/feed`. Shows real NFL
scoring plays involving players on your rosters, across every connected league,
with you / opponent / mixed colour coding.

**Files:**
- `app/feed/page.tsx` — gated server wrapper (mirrors Game Day onboarding gate)
- `components/FeedContent.tsx` — client; aggregates rosters + overlays plays
- `lib/nflPlays.ts` — fetch + parse ESPN public scoring plays
- `app/api/feed/plays/route.ts` — auth-gated, globally cached ESPN proxy

**How it works:**
1. Fetches `/api/user/connections`, `/api/leagues/data`, `/api/feed/plays`.
2. Pulls each league's own team + current opponent rosters (reuses
   `/api/roster/[teamKey]`, which already handles all 3 platforms + ESPN refresh).
3. Builds roster membership: skill players keyed by name, defenses by team abbr.
4. Overlays ESPN scoring plays onto that membership; only plays involving a
   rostered player become entries.
5. Filters: All / My players / Touchdowns / Helping me / Against me (all work).

**Data source:** ESPN's free public sports API (`site.api.espn.com`), separate
from the fantasy APIs, no auth, NFL-wide. Parser was unit-tested against real
ESPN play strings (handles "pass to", "pass from", double parentheses, FG,
INT/fumble return TD → team D/ST, etc.).

**Known V1 limits (the next layer, when wanted):**
- ESPN `scoringPlays` carry **no wallclock**, so entries show the game clock
  ("Q3 3:16") not "2m ago." Code auto-upgrades to relative time if a wallclock
  ever appears on a play.
- Chip numbers show each player's **points-to-date in that league** (from
  rosters), not exact per-play fantasy points. True per-play points would need
  each league's full scoring ruleset (a separate effort).
- Feed shows its empty state until Week 1 (off-season = no live/post games).

**To verify:** test end-to-end once preseason games start (couldn't test live in
the off-season; pipeline was validated against a real past game, Week 15 2024).

---

## 3. Strategic conclusions (the business conversation)

**Competitive reality (researched live):** the broad idea is NOT a market gap.
**FantasyPros "Game Day"** has done almost exactly this since 2022: multi-league
sync (Yahoo/ESPN/Sleeper + more), live play-by-play feed, "on your team / on an
opponent's / both" flagging, a my-starters toggle, AND real per-play fantasy
points. It is free, highly rated (~4.8 stars, ~68k reviews). DataForce,
RotoBaller, PFF also have cross-league live scoreboards.

**Where a real (narrower) wedge remains:**
1. **ESPN "stays connected" reliability.** ESPN sync is the perennial industry
   pain (no real OAuth); everyone's breaks. If League Blitz genuinely stays
   connected, that is a felt, switch-worthy edge. (This is the app's core moat.)
2. **Focused, phone-first, clean feel** vs the incumbents' dense analytics
   terminals. (The Sleeper lesson: focus + feel win.)
3. **The family / group angle** — born as a family-league app; a shared,
   social, multi-league experience is under-served.

**Honest ceiling:** these are execution/positioning wedges, not a technical moat.
Realistic indie outcome is side income, not a salary, unless it either goes the
gambling route or becomes an audience/media business.

---

## 4. Monetization — DECISION: go fully free

Reasoning: the market is anchored at free (FantasyPros, ESPN, Yahoo, Sleeper),
fantasy players are cheap and seasonal, and as an unknown indie the bottleneck is
adoption, not pricing. A Pro tier now would put a padlock on a thin feature set;
there is currently nothing built that a rational person pays ~$20 for. (The AI
analysis features are a weak paywall anchor — "GPT tells me who'll win" is
commoditized.)

**The clean revenue stack to build toward (no gambling dependence):**

1. **League HQ — commissioner + dues (THE STANDOUT, build toward this).**
   Commissioner collects buy-ins through League Blitz; you take a small service
   fee (flat per-league or a % of the pot) on money already changing hands.
   LeagueSafe model. Clean, real money, *better* product (less commish admin),
   and makes you the rails the whole league runs on (stickiest position). The
   commissioner is also already your best buyer. Involves real payments
   plumbing (Stripe Connect / escrow / payout compliance) = a genuine build.
2. **League Store** — auto-generated, personalized end-of-season trophies / rings
   / belts / last-place punishment tees, pre-filled from real results.
   Print-on-demand, ~$10–40 margin/order, zero inventory, sells itself in group
   chats.
3. **Game Day Partners** — contextual non-gambling affiliate (wings via
   DoorDash, jerseys via Fanatics, NFL Sunday Ticket). One labeled module below
   the matchups, opt-in, never mid-feed.
4. **Tip jar / founding supporter** — cleanest first dollars from people who
   just want to support an indie tool.

**Consolidated cross-league alerts** = the one genuinely payable Pro feature if a
Pro tier is ever wanted ("your players, every league, one notification stream").
Not built yet. This is the gap between "nice free app" and "thing people pay for."

**The gambling route (documented, NOT the chosen path):** sportsbook/DFS
affiliate is where the real money is ($150–350+ CPA per funded bettor; ~10–12x
subscription revenue per user). At 50k+ users with aggressive integration, a
million/season becomes conceivable. BUT the big numbers require *pushing*
gambling at users, the revenue rides on the people being harmed, and it can
erode the trust that drives growth. Stance landed on: do not build the business
to *depend* on it. If ever used, only a restrained, clearly-labeled, 21+,
1-800-GAMBLER, contained odds tab — never bet buttons injected into the feed.

---

## 5. Mockups produced (in `mockups/`, open in a browser)

- `scoring-feed.html` — the approved Live Feed design (square cards, solid left
  accent bar, SVG icons, no emoji). This is what the built `/feed` follows.
- `odds-integration.html` — the **restrained** gambling/odds tab (player props
  for your roster, age-gated, compliant, contained). Documents what the
  *aggressive* version would change.
- `monetization-concepts.html` — three clean concepts stacked: **League HQ**
  (dues + commish tools), **League Store** (auto trophies/merch), **Game Day
  Partners** (non-gambling affiliate).
- `espn-connect-flow.html` — earlier ESPN connection flow mock.

---

## 6. Current full feature inventory

**Accounts/onboarding:** Clerk sign-in/up, `/welcome`, onboarding wizard, soft
gating, privacy page.

**League connections:** Yahoo (OAuth), Sleeper (username), ESPN (pasted cookies +
browser-extension relay + bookmarklet). ESPN auto-discovers leagues, auto-detects
your team, server-side token refresh ("stays connected"). Multi-league,
multi-platform, unified.

**Core views:** Scores/Dashboard (platform tabs, expandable rosters, projected
standings w/ current vs projected toggle), Game Day (hero matchups across leagues
+ AI narrative), My Team, Rankings (power rankings + weekly awards), **Live Feed**.

**AI (OpenAI):** matchup analysis, roster analysis, Game Day narrative; weather +
injury + projection context; 15/hr rate limit.

**Personalization:** NFL team accent theming (32 teams, persisted), League Blitz
themeable logo, mobile hamburger nav.

**Browser extension:** League Blitz Chrome extension for ESPN sync — BUILT, NOT
PUBLISHED. `extension/STORE_LISTING.md` ready.

**Infra:** unified data endpoint w/ per-league error isolation, KV/in-memory
caching w/ live-score TTLs, error boundaries, skeletons, error banners, health
check, gated debug suite.

**Demo/showcase:** `/dashboard/demo` with Trophy Case + Message Board (these live
on the demo page, not wired as live features).

---

## 7. Open threads / recommended next steps

Priority order:
1. **Spec League HQ** (dues plumbing): Stripe Connect, who holds the money,
   escrow vs pass-through, fee mechanics, MVP vs later. The monetization path
   worth turning into a real plan.
2. **Build consolidated cross-league alerts** — the one genuinely payable
   feature; also the strongest engagement driver for a live-feed product.
3. **Publish the Chrome extension** — needs the $5 Chrome Web Store account +
   screenshots; `STORE_LISTING.md` is ready.
4. **Rotate the exposed `SESSION_SECRET`** (flagged earlier; signs the extension
   relay token + derives ESPN cookie encryption key).
5. **Verify the Live Feed end-to-end** once preseason games start.
6. (Optional) scheduled re-sync cron for ESPN.

Deferred: a paid Pro tier (nothing payable built yet — revisit after alerts /
League HQ exist).

---

## 8. Conventions / rules to carry forward

- **No emojis anywhere in the UI, ever.** Use lucide-react or inline SVG.
- **No em dashes (—) or en dashes (–) in UI copy.** Use periods, commas, "to",
  parentheses. (Both rules: the user dislikes "AI-generated" tells.)
- **No 10s polling.** Manual refresh + auto-refresh only during live NFL windows.
- **Always `cache: "no-store"`** on client fetches to internal APIs.
- Display name **"League Blitz"**; domain stays **familybizfootball.com**;
  technical identifiers stay **fbl-***.
- Debug routes gated by `DEBUG_ROUTES=1`.

---

## 9. Key technical context

- Next.js 14 App Router, TypeScript, Tailwind (dark "pitch" palette + themeable
  `--accent` CSS vars), Clerk v7 auth, Vercel KV (Upstash, `@vercel/kv`).
- **KV gotcha (history):** the production Upstash DB was once deleted by free-tier
  inactivity, which silently broke all persistence. Now on a PAYG DB. If
  persistence "mysteriously" breaks, check the KV env vars / DB first.
- ESPN strategy: capture session once on desktop (extension/bookmarklet/cookies)
  → server refreshes the token → works on phone forever. No email/password.
- Required env: Clerk keys, Yahoo OAuth, `OPENAI_API_KEY`, `SESSION_SECRET`,
  KV_REST_API_URL/TOKEN. See `.env.example` and `CLAUDE.md`.
- The repo is the `fbl/` subdirectory: `/Users/celticwinter/Projects/football/fbl`.
