// Surfaces per-league load failures returned by /api/leagues/data (in its
// `errors` array) so a platform whose auth expired or upstream is down tells
// the user to reconnect instead of silently vanishing from the view.

export type LeagueLoadError = { platform: string; leagueId: string; error: string };

export default function LeagueErrorBanner({ errors }: { errors: LeagueLoadError[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1.5">
      <p className="text-[11px] font-bold tracking-[0.15em] text-amber-400/90 uppercase">
        {errors.length === 1 ? "1 league needs attention" : `${errors.length} leagues need attention`}
      </p>
      {errors.map((e, i) => (
        <p key={`${e.platform}:${e.leagueId}:${i}`} className="text-sm text-amber-200/70">
          <span className="font-semibold uppercase text-amber-300/80">{e.platform}</span> — {e.error}
        </p>
      ))}
    </div>
  );
}
