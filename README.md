<div align="center">

# Family Business League

Next.js 14 (App Router) + TypeScript + Tailwind + OpenAI analysis.

</div>

## Features
* Matchup AI analysis (structured JSON → UI tiles)
* Real-weather impact & opportunities (Open‑Meteo style utilities)
* Scoreboard / standings / news scaffolding
* File/stdout AI prompt+response logging abstraction
* Scripts for roster name shortening & restoration
* Ready for Vercel or self-host (Node 18+)

## Quick Start (Local Dev)
```bash
cp .env.example .env.local   # add OPENAI_API_KEY
npm install
npm run dev
# App served (port may increment if 3000 busy)
```
Open: http://localhost:3000

## Production Build
```bash
npm run build
npm start
```

## Environment Variables
| Var | Required | Purpose |
|-----|----------|---------|
| OPENAI_API_KEY | yes | AI matchup analysis |
| YAHOO_CLIENT_ID | future | Yahoo OAuth (not yet wired) |
| YAHOO_CLIENT_SECRET | future | Yahoo OAuth |
| LOG_SINK | optional | When implemented for external logs (e.g. `s3`, `db`) |

## Logging Strategy
`lib/logger.ts` chooses storage:
* Local dev / self-host: JSONL files under `logs/ai/YYYY-MM-DD.jsonl`.
* Vercel (detected via `process.env.VERCEL`): falls back to stdout (`[AI_LOG] ...`).
* `/debug/ai-logs` page: lists file logs locally, shows notice on Vercel.

To implement persistent logs on serverless, add a sink (S3 / DB) and branch in `logAI` on `LOG_SINK`.

## Deployment (Vercel)
1. Push repo to GitHub.
2. Import in Vercel dashboard or run `vercel` CLI.
3. Add `OPENAI_API_KEY` env var (Project → Settings → Environment Variables).
4. (Optional) Add custom domain `familybizfootball.com`.
5. Visit `/debug/ai-logs` (will show ephemeral notice) and trigger a matchup to see `[AI_LOG]` lines in Vercel logs.

## Deployment (Self-Host)
```bash
npm ci
npm run build
OPENAI_API_KEY=sk-... NODE_ENV=production npm start
```
Reverse proxy (Nginx/Caddy) to `127.0.0.1:3000` and enable HTTPS.

## Docker (Optional)
After adding the provided Dockerfile (if present):
```bash
docker build -t fbl .
docker run -d -p 3000:3000 --env-file .env.local fbl
```

## Health Check
`/api/health` (added via workflow) returns `{ ok: true }` once implemented.

## AI Analysis Flow
1. Client calls `/api/analyze-matchup/mock` with team keys.
2. Server builds strict system+user prompt → `openai.chat.completions`.
3. Response parsed & sanitized (win probabilities recalculated, team names normalized).
4. UI displays tiles (Headline, Showdown, X-Factor, Boom/Bust, Weather, Bench Help, Analysis).

## Roster Name Utilities
Scripts in `scripts/`:
* `shortenRosterNames.js` → produces `rosters.shortnames.json` with `F. Lastname` format.
* `restoreRosters.js` → restores full names.

## Development Notes
* App Router (directory `app/`).
* Tailwind configured in `tailwind.config.ts`.
* Type-safe paths via TS `paths` (`@/*`).
* Do not commit real secrets – use `.env.local`.

## Future Enhancements
* External persistent log sink
* Yahoo live data parity for analysis prompt
* Surface quickHits & confidence in UI
* Rate limiting middleware

## License
Add a LICENSE file appropriate for your use (MIT recommended). Let me know if you want it generated.

---
Maintained by you — AI assistant scaffolding provided.
