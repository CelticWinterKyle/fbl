import "./globals.css";
import Link from "next/link";
import { Bebas_Neue, Rajdhani } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import NavLinks from "@/components/NavLinks";
import ThemePicker from "@/components/ThemePicker";
import Logo from "@/components/Logo";
import { getUserTheme } from "@/lib/tokenStore/index";
import { accentVarsForTeam } from "@/lib/teamThemes";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});

const rajdhani = Rajdhani({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-rajdhani",
  display: "swap",
});

export const metadata = { title: "Family Business", description: "Fantasy league hub" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Apply the user's NFL-team accent server-side (no flash). Default = amber.
  const { userId } = await auth();
  const team = userId ? await getUserTheme(userId) : null;
  const accentStyle = (accentVarsForTeam(team) ?? undefined) as unknown as React.CSSProperties | undefined;

  return (
    <ClerkProvider>
      <html lang="en" className={`${bebasNeue.variable} ${rajdhani.variable}`} style={accentStyle}>
        <body className="min-h-screen font-ui">
          <header className="sticky top-0 z-10 border-b border-pitch-700/80 bg-pitch-900/92 backdrop-blur-md">
            <div className="max-w-7xl mx-auto flex items-center justify-between py-2.5 px-6">
              {/* Logo (green follows the team accent; black shapes render white) */}
              <Link href="/" className="flex items-center hover:opacity-85 transition-opacity" aria-label="League Blitz — home">
                <Logo className="h-11 w-auto text-accent" />
              </Link>

              <div className="flex items-center gap-3">
                <NavLinks />
                <ThemePicker currentTeam={team ?? null} />
              </div>
            </div>
          </header>

          <main className="relative z-[1] max-w-7xl mx-auto py-8 px-6">
            {children}
          </main>

          <footer className="relative z-[1] max-w-7xl mx-auto py-6 px-6 border-t border-pitch-700/40">
            <span className="text-xs tracking-widest text-gray-600 uppercase font-semibold">
              © {new Date().getFullYear()} Family Business League
            </span>
          </footer>
        </body>
      </html>
    </ClerkProvider>
  );
}
