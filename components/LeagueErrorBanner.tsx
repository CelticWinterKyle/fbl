// Surfaces per-league load failures returned by /api/leagues/data (in its
// `errors` array) so a platform whose auth expired or upstream is down tells
// the user to reconnect instead of silently vanishing from the view.
//
// Errors carrying `actionable: false` are the platform's fault, not the
// user's (Yahoo pausing API access for the whole app, say). Those must not be
// labelled "needs attention": there is nothing for the user to do, and the
// same message repeated once per league reads as several separate problems.

export type LeagueLoadError = {
  platform: string;
  leagueId: string;
  error: string;
  actionable?: boolean;
};

/** Collapse leagues that failed the same way on the same platform into one line. */
function group(errors: LeagueLoadError[]) {
  const out: { key: string; platform: string; error: string; count: number }[] = [];
  for (const e of errors) {
    const key = `${e.platform}:${e.error}`;
    const existing = out.find((g) => g.key === key);
    if (existing) existing.count++;
    else out.push({ key, platform: e.platform, error: e.error, count: 1 });
  }
  return out;
}

export default function LeagueErrorBanner({ errors }: { errors: LeagueLoadError[] }) {
  if (!errors || errors.length === 0) return null;

  const actionable = errors.filter((e) => e.actionable !== false);
  const heading =
    actionable.length === 0
      ? "Waiting on the platform"
      : actionable.length === 1
      ? "1 league needs attention"
      : `${actionable.length} leagues need attention`;

  return (
    <div className="rounded-xl border border-accent-strong/30 bg-accent-strong/5 px-4 py-3 space-y-1.5">
      <p className="text-[11px] font-bold tracking-[0.15em] text-accent/90 uppercase">
        {heading}
      </p>
      {group(errors).map((g) => (
        <p key={g.key} className="text-sm text-accent-soft/70">
          <span className="font-semibold uppercase text-accent-soft/80">{g.platform}</span>: {g.error}
          {g.count > 1 && (
            <span className="text-accent-soft/50"> ({g.count} leagues)</span>
          )}
        </p>
      ))}
    </div>
  );
}
