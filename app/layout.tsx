import "./globals.css";
import Link from "next/link";
import { Bebas_Neue, Rajdhani } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import NavLinks from "@/components/NavLinks";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${bebasNeue.variable} ${rajdhani.variable}`}>
        <body className="min-h-screen font-ui">
          <header className="sticky top-0 z-10 border-b border-pitch-700/80 bg-pitch-900/92 backdrop-blur-md">
            <div className="max-w-7xl mx-auto flex items-center justify-between py-2.5 px-6">
              {/* Wordmark */}
              <Link href="/" className="flex items-center gap-3 hover:opacity-85 transition-opacity group">
                <div className="relative h-8 w-8 shrink-0 flex items-center justify-center">
                  <div className="absolute inset-0 bg-amber-400 rotate-45 rounded-sm" />
                  <span className="relative font-display text-[14px] text-pitch-950 leading-none select-none">
                    FB
                  </span>
                </div>
                <div className="flex flex-col leading-none">
                  <span className="font-display text-[22px] tracking-[0.08em] text-white leading-none">
                    FAMILY BUSINESS
                  </span>
                  <span className="text-[10px] font-semibold tracking-[0.2em] text-amber-500/70 uppercase">
                    Fantasy League
                  </span>
                </div>
              </Link>

              <NavLinks />
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
