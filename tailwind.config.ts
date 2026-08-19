import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // OKLCH token refs (see globals.css :root)
        paper: "var(--color-paper)",
        "paper-2": "var(--color-paper-2)",
        "paper-3": "var(--color-paper-3)",
        "paper-4": "var(--color-paper-4)",
        ink: "var(--color-ink)",
        "ink-2": "var(--color-ink-2)",
        "ink-3": "var(--color-ink-3)",
        accent: "var(--color-accent)",
        "accent-2": "var(--color-accent-2)",
        "accent-ink": "var(--color-accent-ink)",
        danger: "var(--color-danger)",
        warn: "var(--color-warn)",
        ok: "var(--color-ok)",
        focus: "var(--color-focus)",
        line: "var(--color-line)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        full: "9999px",
      },
      boxShadow: {
        soft: "0 1px 0 0 var(--color-line), 0 8px 24px -18px oklch(24% 0.018 60 / 0.16)",
        lift: "0 12px 40px -16px oklch(24% 0.018 60 / 0.20)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-soft": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 300ms var(--ease-out)",
        "fade-up": "fade-up 400ms var(--ease-out)",
        shimmer: "shimmer 1.6s var(--ease-in-out) infinite",
        "pulse-soft": "pulse-soft 2s var(--ease-in-out) infinite",
        "scale-in": "scale-in 200ms var(--ease-out)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        in: "var(--ease-in)",
        "in-out": "var(--ease-in-out)",
      },
    },
  },
  plugins: [],
};
export default config;
