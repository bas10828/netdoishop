import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // NETDOI navy, taken from the proposal/quotation header so the
        // storefront and the documents customers receive look like one brand.
        brand: {
          50: "#f1f5fb",
          100: "#e2eaf5",
          200: "#c5d4ea",
          300: "#9bb4d8",
          400: "#6a8dc1",
          500: "#466ea8",
          600: "#34568c",
          700: "#2a4672",
          800: "#1b3358",
          900: "#0f2a4a",
          950: "#0a1c33",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgb(15 42 74 / 0.04), 0 1px 3px rgb(15 42 74 / 0.06)",
        lift: "0 10px 30px -12px rgb(15 42 74 / 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
