import "./globals.css";
import Link from "next/link";

export const metadata = { title: "Family Business", description: "Fantasy league hub" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
        <header className="border-b border-gray-700 bg-gray-900/90 backdrop-blur sticky top-0 z-10">
          <div className="max-w-7xl mx-auto flex items-center justify-between py-3 px-6">
            <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="h-6 w-1.5 rounded bg-blue-500" />
              <span className="text-xl font-bold">Family Business</span>
              <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300">NFL</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/dashboard"
                className="px-3 py-1.5 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/connect"
                className="px-3 py-1.5 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
              >
                Leagues
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto py-6 px-6">{children}</main>
        <footer className="max-w-7xl mx-auto py-6 px-6 text-xs text-gray-400">
          © {new Date().getFullYear()} Family Business League
        </footer>
      </body>
    </html>
  );
}
