import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center -mx-6 -mt-8 px-6 bg-pitch-950">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 mb-10 hover:opacity-85 transition-opacity">
        <div className="relative h-9 w-9 shrink-0 flex items-center justify-center">
          <div className="absolute inset-0 bg-accent rotate-45 rounded-sm" />
          <span className="relative font-display text-[15px] text-pitch-950 leading-none select-none">LB</span>
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-display text-[22px] tracking-[0.08em] text-white leading-none">LEAGUE BLITZ</span>
          <span className="text-[10px] font-semibold tracking-[0.2em] text-accent-strong/70 uppercase">Fantasy League</span>
        </div>
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
