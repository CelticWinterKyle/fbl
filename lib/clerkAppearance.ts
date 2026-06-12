// Shared Clerk appearance for the SignIn/SignUp widgets, matched to the pitch
// theme. colorNeutral MUST stay light: Clerk derives every muted gray (OTP box
// borders, identity preview, "Secured by Clerk", secondary buttons) as alpha
// shades of it, so a dark neutral renders near-invisible on the dark card.
export const clerkAppearance = {
  variables: {
    colorPrimary: "#fbbf24",
    colorBackground: "#0f1117",
    colorInputBackground: "#1a1d27",
    colorInputText: "#ffffff",
    colorText: "#ffffff",
    colorTextSecondary: "#9ca3af",
    colorNeutral: "#ffffff",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-rajdhani), sans-serif",
  },
  elements: {
    card: "bg-pitch-900 border border-pitch-700/60 shadow-2xl shadow-black/50",
    headerTitle: "text-white font-display tracking-widest",
    headerSubtitle: "text-gray-400",
    socialButtonsBlockButton: "bg-pitch-800 border-pitch-700 hover:bg-pitch-700 text-white",
    dividerLine: "bg-pitch-700",
    dividerText: "text-gray-500",
    formFieldLabel: "text-gray-400 text-xs tracking-wider uppercase",
    formFieldInput: "bg-pitch-800 border-pitch-600 text-white placeholder-gray-600 focus:border-accent-strong/50",
    footerActionLink: "text-accent hover:text-accent-soft",
    formButtonPrimary: "bg-accent hover:bg-accent-soft text-pitch-950 font-bold tracking-wider",
  },
};
