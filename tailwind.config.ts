import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: "#07080d",
          900: "#0d0e14",
          800: "#141520",
          700: "#1e2030",
          600: "#282b40",
          500: "#363a55",
          400: "#4e5370",
        },
        // Themeable accent (driven by --accent CSS vars; defaults to amber).
        // Supports opacity modifiers, e.g. bg-accent/20, text-accent-strong/70.
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          strong: "rgb(var(--accent-strong) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["var(--font-bebas)", "Impact", "sans-serif"],
        ui: ["var(--font-rajdhani)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
