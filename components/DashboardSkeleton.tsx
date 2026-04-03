// Pulsing skeleton that mirrors the dashboard layout.
// Shown while /api/leagues/data is loading so there's no layout shift.

function Pulse({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-pitch-800 ${className}`} />
  );
}

function MatchupCardSkeleton() {
  return (
    <div className="rounded-lg border border-pitch-700 bg-pitch-900 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Pulse className="h-3 w-20" />
        <Pulse className="h-3 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex-1 text-center space-y-2">
          <Pulse className="h-3 w-24 mx-auto" />
          <Pulse className="h-8 w-16 mx-auto" />
        </div>
        <Pulse className="h-3 w-6 mx-2" />
        <div className="flex-1 text-center space-y-2">
          <Pulse className="h-3 w-24 mx-auto" />
          <Pulse className="h-8 w-16 mx-auto" />
        </div>
      </div>
      <div className="pt-3 border-t border-pitch-800">
        <Pulse className="h-6 w-20" />
      </div>
    </div>
  );
}

function StandingsRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-pitch-700/50">
      <Pulse className="h-3 flex-1" />
      <Pulse className="h-3 w-5" />
      <Pulse className="h-3 w-5" />
      <Pulse className="h-3 w-10" />
    </div>
  );
}

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Pulse className="h-6 w-56" />
        <div className="ml-auto flex items-center gap-2">
          <Pulse className="h-8 w-24 rounded-lg" />
          <Pulse className="h-8 w-8 rounded-lg" />
          <Pulse className="h-8 w-20 rounded-lg" />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border border-pitch-700 bg-pitch-900 p-4">
            <div className="mb-4"><Pulse className="h-4 w-24" /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MatchupCardSkeleton />
              <MatchupCardSkeleton />
              <MatchupCardSkeleton />
              <MatchupCardSkeleton />
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-pitch-700 bg-pitch-900 p-4">
            <div className="mb-4"><Pulse className="h-4 w-20" /></div>
            <div className="space-y-0">
              {Array.from({ length: 8 }).map((_, i) => (
                <StandingsRowSkeleton key={i} />
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-pitch-700 bg-pitch-900 p-4 space-y-3">
            <Pulse className="h-4 w-24 mb-4" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Pulse key={i} className="h-3 w-full" />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
