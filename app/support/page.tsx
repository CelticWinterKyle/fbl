import { Mail } from "lucide-react";

export const metadata = { title: "Support | League Blitz" };

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-pitch-950 text-gray-300 -mx-6 -mt-8 px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="font-display text-4xl tracking-[0.08em] text-white">NEED HELP?</h1>
          <p className="text-sm text-gray-500">
            Email us and a human will get back to you, usually within a day.
          </p>
        </header>

        <a
          href="mailto:kyle@celticwinter.com"
          className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-bold tracking-wide text-accent hover:bg-accent/15 transition-colors"
        >
          <Mail className="w-4 h-4" aria-hidden="true" />
          kyle@celticwinter.com
        </a>

        <section className="space-y-2">
          <h2 className="font-display text-xl tracking-[0.06em] text-white">Quick fixes first</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed text-gray-400">
            <li>
              <strong className="text-gray-200">Yahoo league missing or stale?</strong>{" "}
              Reconnect Yahoo from the Leagues page; tokens occasionally expire.
            </li>
            <li>
              <strong className="text-gray-200">ESPN league not updating?</strong>{" "}
              Re-run the ESPN sync: open your ESPN league on a computer and click
              your League Blitz bookmark (or let the extension sync), then refresh here.
            </li>
            <li>
              <strong className="text-gray-200">Something else off?</strong>{" "}
              Check each platform&apos;s connection status on the Leagues page;
              a disconnected platform shows there first.
            </li>
          </ul>
        </section>

        <p className="text-xs text-gray-600 pt-4 border-t border-pitch-800">
          Looking for our{" "}
          <a href="/privacy" className="text-accent hover:text-accent-soft">Privacy Policy</a>{" "}
          or{" "}
          <a href="/terms" className="text-accent hover:text-accent-soft">Terms of Service</a>?
        </p>
      </div>
    </div>
  );
}
