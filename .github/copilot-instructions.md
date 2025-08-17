# AI Assistant Working Guide for Family Business League

Concise, actionable context so an AI agent can be productive fast.

## 1. Tech Stack & Runtime
- Next.js 14 App Router (directory: `app/`) with TypeScript.
- Tailwind CSS (`tailwind.config.ts`) for styling.
- Node 18+ expected (Vercel compatible). Dockerfile present for container build.
- Key external APIs: OpenAI (matchup analysis) & Yahoo Fantasy Sports (league/team data).
- Data + mock/demo content under `data/` and demo dashboard at `app/dashboard/demo`.

## 2. Yahoo Fantasy Integration
Files:
- Core auth & fetch helpers: `lib/yahoo.ts` (guard + team/league discovery + deep debug logging).
- Token persistence (global): `lib/tokenStore.ts` (file: `lib/yahoo-tokens.json`).
- Token persistence (per-user optional): `lib/userTokenStore.ts` (JSON files in `lib/yahoo-users/` or `/tmp/yahoo-users` on serverless).
- User session cookie: `lib/userSession.ts` (`fbl_uid` cookie generation/retrieval).

Patterns:
- Guard first (skip flag or missing creds) via `getYahooAuthed` / `getYahooAuthedForUser`.
- Access/refresh tokens: auto-refresh when `expires_at` is near; buffer = 120s.
- Current league/team listing uses DIRECT HTTP (not SDK generic `yf.api`) to Yahoo endpoints with `users;use_login=1/...` patterns for reliability.
- Derived league keys: parse `team_key` (e.g. `461.l.12345.t.7` → `461.l.12345`).
- Debug endpoints: `/api/yahoo/user/teams`, `/api/yahoo/user/leagues`, `/api/yahoo/whoami` return structured JSON with `debug` optionally when `?debug=1`.
- If migrating to per-user tokens, swap calls in routes to `getYahooAuthedForUser(userId)` and wire `getValidAccessTokenForUser`.

Common pitfalls:
- Using SDK methods that don’t exist in current `yahoo-fantasy` version (`user.teams` not present). Prefer direct fetch or existing `user.game_leagues`/`user.game_teams`.
- Assuming a league env var: logic now intentionally avoids requiring `YAHOO_LEAGUE_ID` during discovery.
- Build-time access: rely on `dynamic='force-dynamic'` + `fetchCache='force-no-store'` on data-sensitive routes/pages.

## 3. AI / OpenAI Flow
- Entry: components like `AnalyzeMatchup` call API route `app/api/analyze-matchup/route.ts` (and mock variant). (If absent or renamed, search for `openai` usage.)
- Prompt assembly & OpenAI client: `lib/openai.ts`.
- Logging of prompts/responses: `lib/logger.ts` → JSONL under `logs/ai/YYYY-MM-DD.jsonl` local or stdout (`[AI_LOG]`) on Vercel.
- Output normalization (win probability recalculation, sanitization) handled in the route/component logic.

## 4. Directory Map & Roles
- `app/` : Pages & API routes (App Router). Subfolders: `api/`, feature pages (`dashboard`, `debug`, etc.).
- `components/` : Pure UI / presentational + a few data-triggering components (e.g. `AnalyzeMatchup`). Keep them server/client as currently defined (check for hooks before converting).
- `lib/` : Core domain helpers (Yahoo, OpenAI, weather, stores, token handling, logging, user session).
- `data/` : Static JSON seeds & demo artifacts.
- `scripts/` : One-off maintenance (shorten roster names, restore rosters, generate teams).
- `logs/` : AI log output (ignored in production deployments except stdout fallback).

## 5. Conventions
- API responses: Prefer `{ ok: boolean, ... }` pattern. Error cases often still HTTP 200 with `ok:false` + `reason` code (except explicit unauthorized may return 401). Preserve that contract.
- Debug toggles: Query param `debug=1` returns enriched internals (`tried`, `errors`, `auth_tests`, etc.). Don’t leak raw tokens.
- League/team derivation: Always derive `league_key` from `team_key`; avoid trusting env for listing.
- Token refreshing: Only triggered when `expires_at` absent or expired; buffer ensures preemptive refresh.
- Dynamic rendering: For live Yahoo-dependent pages/routes include: `export const dynamic = 'force-dynamic'; export const revalidate = 0; export const fetchCache = 'force-no-store';`.

## 6. Adding New Yahoo Features
1. Acquire user context via `getOrCreateUserId` if per-user tokens needed.
2. Call `getYahooAuthedForUser(userId)` (switch existing global usage if personalization required).
3. Use direct REST fetch with Bearer token for unsupported SDK endpoints (pattern already in `lib/yahoo.ts`: `makeDirectYahooRequest`).
4. Reuse `normalizeTeams` or create similar normalizers for new resource types; log shape briefly during development and gate behind `debug` param.

## 7. Logging & Debugging
- Use `console.log` plus structured objects in debug branches—existing patterns show selective verbose logging only in failure paths.
- Use `logger.logAI` for AI-related structured events (search in repo for exact export if adding new logs).
- Do not log full tokens; show prefix + suffix only.

## 8. Environment Variables (critical subset)
- `OPENAI_API_KEY` required for analysis endpoints.
- `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET` required for Yahoo calls; `SKIP_YAHOO=1` to short-circuit.
- `PUBLIC_BASE_URL` or explicit `YAHOO_REDIRECT_URI` influences refresh redirect URI.
- Avoid hard coding league IDs in code—derive dynamically.

## 9. Typical Development Workflow
```bash
cp .env.example .env.local  # fill keys
npm install
npm run dev                 # start Next dev
# Access http://localhost:3000/dashboard or /dashboard/demo
# Test Yahoo endpoints: curl http://localhost:3000/api/yahoo/user/teams?debug=1
```
If tokens stale, re-run Yahoo OAuth flow (route not shown here—add callback under `/api/yahoo/callback` if extending).

## 10. Safe Change Principles
- Preserve `{ ok:false, reason }` schema for clients.
- When expanding Yahoo logic, add new `reason` codes rather than throwing.
- Keep heavy debug output behind `debug=1` or temporary instrumentation removed after diagnosing.
- Prefer incremental edits in `lib/yahoo.ts` rather than scattering direct fetch logic.

## 11. Missing / TODO Areas
- OAuth initiation & callback not fully surfaced in current tree (implement if enabling multi-user real flow).
- Per-user league selection persistence (see `userLeagueStore.ts` placeholder). Add an API route to store chosen `league_key` keyed by user id.
- Health endpoint (`/api/health`) referenced in README but ensure route exists or add one returning `{ ok: true }`.

---
Feedback welcome: clarify Yahoo token refresh, AI prompt format, or league selection persistence?
