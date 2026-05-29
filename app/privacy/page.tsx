export const metadata = { title: "Privacy Policy | League Blitz" };

// Public privacy policy — also serves as the privacy-policy URL required by the
// Chrome Web Store listing for the League Blitz extension. Plain, honest, and specific to
// what the app + extension actually do. Have a professional review before launch.

const UPDATED = "May 28, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-pitch-950 text-gray-300 -mx-6 -mt-8 px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="font-display text-4xl tracking-[0.08em] text-white">PRIVACY POLICY</h1>
          <p className="text-sm text-gray-500">Last updated: {UPDATED}</p>
        </header>

        <section className="space-y-3 text-sm leading-relaxed">
          <p>
            League Blitz (&ldquo;League Blitz&rdquo;, &ldquo;we&rdquo;) is a fantasy
            football dashboard that aggregates your Yahoo, Sleeper, and ESPN fantasy
            leagues into one view. This policy explains what we collect, why, and how
            it&apos;s protected — including our optional browser extension.
          </p>
        </section>

        <Section title="What we collect">
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-gray-200">Account info.</strong> Your email and a user ID, via our authentication provider (Clerk).</li>
            <li><strong className="text-gray-200">League connections.</strong> The fantasy leagues you connect and which team is yours.</li>
            <li><strong className="text-gray-200">Platform credentials.</strong> The tokens needed to read your leagues — Yahoo OAuth tokens, your Sleeper username, and (for private ESPN leagues) ESPN session cookies/tokens. These are stored <strong className="text-gray-200">encrypted at rest</strong> and used only to fetch your own league data.</li>
            <li><strong className="text-gray-200">League data.</strong> Matchups, rosters, standings, and scores for the leagues you connect.</li>
          </ul>
        </Section>

        <Section title="How the browser extension works">
          <p>
            The optional League Blitz browser extension exists for one purpose: to connect your
            private ESPN leagues. When you use it, it reads your ESPN session
            cookies <em>from your own browser</em> and uses them to fetch your league
            data, which it sends to your League Blitz account over an authenticated, signed
            request. It does not read data from any non-ESPN, non-League Blitz site, it does
            not track your browsing, and it does not collect anything unrelated to
            syncing your fantasy leagues.
          </p>
        </Section>

        <Section title="How we use your data">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>To display your leagues, matchups, rosters, and rankings.</li>
            <li>To generate AI matchup and roster analysis you request.</li>
            <li>To keep your connected leagues refreshed.</li>
          </ul>
          <p className="mt-2">
            We <strong className="text-gray-200">do not sell</strong> your data, and we
            do not share it with third parties except the infrastructure providers that
            run the service (e.g. hosting, storage, authentication, and the AI provider
            that powers analysis) acting on our behalf.
          </p>
        </Section>

        <Section title="Data retention &amp; deletion">
          <p>
            Your connections and credentials are kept until you disconnect a league or
            delete your account. Disconnecting a league removes its stored credentials.
            To delete your account and associated data, contact us at the email below.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Sensitive credentials (Yahoo tokens, ESPN cookies/tokens) are encrypted at
            rest. Extension sync requests are authenticated with short-lived signed
            tokens. No system is perfectly secure, but we take reasonable measures to
            protect your information.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions or deletion requests: <a href="mailto:privacy@familybizfootball.com" className="text-accent hover:text-accent-soft">privacy@familybizfootball.com</a>.
          </p>
        </Section>

        <p className="text-xs text-gray-600 pt-4 border-t border-pitch-800">
          League Blitz is not affiliated with, endorsed by, or sponsored by ESPN, Yahoo, or Sleeper.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl tracking-[0.06em] text-white">{title}</h2>
      <div className="text-sm leading-relaxed text-gray-400">{children}</div>
    </section>
  );
}
