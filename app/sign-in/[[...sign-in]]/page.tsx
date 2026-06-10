import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import Logo from "@/components/Logo";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center -mx-6 -mt-8 px-6 bg-pitch-950">
      {/* Logo */}
      <Link href="/" className="mb-8 hover:opacity-85 transition-opacity" aria-label="League Blitz home">
        <Logo className="h-24 w-auto text-accent" />
      </Link>

      <SignIn
        fallbackRedirectUrl="/dashboard"
        appearance={{
          variables: {
            colorPrimary: "#fbbf24",
            colorBackground: "#0f1117",
            colorInputBackground: "#1a1d27",
            colorInputText: "#ffffff",
            colorText: "#ffffff",
            colorTextSecondary: "#6b7280",
            colorNeutral: "#374151",
            borderRadius: "0.5rem",
            fontFamily: "var(--font-rajdhani), sans-serif",
          },
          elements: {
            card: "bg-pitch-900 border border-pitch-700/60 shadow-2xl shadow-black/50",
            headerTitle: "text-white font-display tracking-widest",
            headerSubtitle: "text-gray-500",
            socialButtonsBlockButton: "bg-pitch-800 border-pitch-700 hover:bg-pitch-700 text-white",
            dividerLine: "bg-pitch-700",
            dividerText: "text-gray-600",
            formFieldLabel: "text-gray-400 text-xs tracking-wider uppercase",
            formFieldInput: "bg-pitch-800 border-pitch-600 text-white placeholder-gray-600 focus:border-accent-strong/50",
            footerActionLink: "text-accent hover:text-accent-soft",
            formButtonPrimary: "bg-accent hover:bg-accent-soft text-pitch-950 font-bold tracking-wider",
          },
        }}
      />
    </div>
  );
}
