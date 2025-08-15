import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Family Business",
  description: "Fantasy league hub (view only)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
          <div className="container flex items-center justify-between py-3">
            <h1 className="text-lg font-semibold">Family Business</h1>
            <nav className="flex gap-2 text-sm">
              <Link className="btn" href="/api/yahoo/login">Connect Yahoo</Link>
              <Link className="btn" href="/">Dashboard</Link>
            </nav>
          </div>
        </header>
        <main className="container py-6">{children}</main>
        <footer className="container py-6 text-xs text-gray-500">
          © {new Date().getFullYear()} Family Business League
        </footer>
      </body>
    </html>
  );
}
