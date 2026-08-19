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
        // OKLCH token refs (see globals.css :root). Wrapped in color-mix so
        // Tailwind opacity modifiers (bg-accent/80 …) work with var() colors —
        // plain var refs compute to transparent when a modifier is applied.
        paper: "color-mix(in oklch, var(--color-paper) calc(<alpha-value> * 100%), transparent)",
        "paper-2": "color-mix(in oklch, var(--color-paper-2) calc(<alpha-value> * 100%), transparent)",
        "paper-3": "color-mix(in oklch, var(--color-paper-3) calc(<alpha-value> * 100%), transparent)",
        "paper-4": "color-mix(in oklch, var(--color-paper-4) calc(<alpha-value> * 100%), transparent)",
        ink: "color-mix(in oklch, var(--color-ink) calc(<alpha-value> * 100%), transparent)",
        "ink-2": "color-mix(in oklch, var(--color-ink-2) calc(<alpha-value> * 100%), transparent)",
        "ink-3": "color-mix(in oklch, var(--color-ink-3) calc(<alpha-value> * 100%), transparent)",
        accent: "color-mix(in oklch, var(--color-accent) calc(<alpha-value> * 100%), transparent)",
        "accent-2": "color-mix(in oklch, var(--color-accent-2) calc(<alpha-value> * 100%), transparent)",
        "accent-ink": "color-mix(in oklch, var(--color-accent-ink) calc(<alpha-value> * 100%), transparent)",
        danger: "color-mix(in oklch, var(--color-danger) calc(<alpha-value> * 100%), transparent)",
        warn: "color-mix(in oklch, var(--color-warn) calc(<alpha-value> * 100%), transparent)",
        ok: "color-mix(in oklch, var(--color-ok) calc(<alpha-value> * 100%), transparent)",
        focus: "color-mix(in oklch, var(--color-focus) calc(<alpha-value> * 100%), transparent)",
        line: "color-mix(in oklch, var(--color-line) calc(<alpha-value> * 100%), transparent)",
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
        "grow-y": {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 300ms var(--ease-out)",
        "fade-up": "fade-up 400ms var(--ease-out)",
        shimmer: "shimmer 1.6s var(--ease-in-out) infinite",
        "pulse-soft": "pulse-soft 2s var(--ease-in-out) infinite",
        "scale-in": "scale-in 200ms var(--ease-out)",
        "grow-y": "grow-y 500ms var(--ease-out) both",
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
