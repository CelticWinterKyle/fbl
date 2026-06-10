export const metadata = { title: "Terms of Service | League Blitz" };

// Public terms of service. Plain-language indie-SaaS terms. Have a professional
// review before launch.

const UPDATED = "June 9, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-pitch-950 text-gray-300 -mx-6 -mt-8 px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="font-display text-4xl tracking-[0.08em] text-white">TERMS OF SERVICE</h1>
          <p className="text-sm text-gray-500">Last updated: {UPDATED}</p>
        </header>

        <section className="space-y-3 text-sm leading-relaxed">
          <p>
            League Blitz (&ldquo;League Blitz&rdquo;, &ldquo;we&rdquo;) is a fantasy
            football dashboard that brings your Yahoo, Sleeper, and ESPN leagues
            into one view. By creating an account or using the service, you agree
            to these terms. If you do not agree, please do not use League Blitz.
          </p>
        </section>

        <Section title="The service">
          <p>
            League Blitz displays data from fantasy platforms you choose to connect,
            adds analysis on top of it, and keeps it refreshed for you. The service
            is provided <strong className="text-gray-200">as-is and as-available</strong>.
            We work to keep it fast and reliable, but we do not guarantee uptime,
            accuracy of scores or projections, or that any particular feature will
            stay available.
          </p>
        </Section>

        <Section title="Not affiliated with the platforms">
          <p>
            League Blitz is an independent product. It is{" "}
            <strong className="text-gray-200">
              not affiliated with, endorsed by, or sponsored by
            </strong>{" "}
            Yahoo, ESPN, Sleeper, or the NFL. All platform names and logos belong
            to their respective owners. Those platforms can change or restrict
            their data access at any time, which may affect what League Blitz can show.
          </p>
        </Section>

        <Section title="Your accounts and responsibilities">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>You are responsible for your accounts on Yahoo, ESPN, and Sleeper, and for complying with each platform&apos;s own terms.</li>
            <li>Only connect leagues and accounts that are yours.</li>
            <li>Keep your League Blitz login secure and do not share your account.</li>
            <li>Do not use League Blitz to abuse, scrape, or overload the connected platforms or our service.</li>
          </ul>
        </Section>

        <Section title="Credentials we store">
          <p>
            To do its job, League Blitz stores the credentials needed to read your
            leagues: Yahoo OAuth tokens, your Sleeper username, and (for private
            ESPN leagues) ESPN session cookies or tokens. They are stored encrypted
            at rest and used only to fetch your own league data. See the{" "}
            <a href="/privacy" className="text-accent hover:text-accent-soft">Privacy Policy</a>{" "}
            for details. You can remove them at any time by disconnecting a league
            or deleting your account.
          </p>
        </Section>

        <Section title="No warranty">
          <p>
            League Blitz is provided without warranties of any kind, express or
            implied, including fitness for a particular purpose. Fantasy decisions
            you make based on scores, projections, or AI analysis shown in the app
            are your own. Do not use League Blitz for wagering decisions you cannot
            afford to get wrong.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, League Blitz and its operator
            are not liable for indirect, incidental, or consequential damages
            arising from your use of the service, including lost matchups, missed
            lineup changes, or inaccurate data. Our total liability for any claim
            is limited to the amount you paid us in the twelve months before the
            claim (which, for a free account, is zero).
          </p>
        </Section>

        <Section title="Termination">
          <p>
            You can stop using League Blitz and delete your account at any time;
            deleting your account removes your stored connections and credentials.
            We may suspend or terminate accounts that abuse the service or violate
            these terms. We may also discontinue the service, and will make
            reasonable efforts to give notice if we do.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            We may update these terms from time to time. If a change is
            significant, we will note it in the app or by email. Continuing to use
            League Blitz after changes take effect means you accept the updated terms.
          </p>
        </Section>

        <Section title="Governing law">
          <p>
            These terms are governed by the laws of the operator&apos;s home
            jurisdiction, without regard to conflict-of-law rules. Any disputes
            will be handled in the courts of that jurisdiction.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these terms:{" "}
            <a href="mailto:kyle@celticwinter.com" className="text-accent hover:text-accent-soft">kyle@celticwinter.com</a>.
          </p>
        </Section>

        <p className="text-xs text-gray-600 pt-4 border-t border-pitch-800">
          League Blitz is not affiliated with, endorsed by, or sponsored by ESPN, Yahoo, Sleeper, or the NFL.
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
