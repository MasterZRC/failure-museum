/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light warm-neutral surfaces (low index = lightest / closest to paper)
        ink: {
          950: "#ffffff",
          900: "#fdfbf8",
          800: "#faf6f0",
          700: "#ebe3d7",
          600: "#dcd1c0",
        },
        // Terracotta accent (replaces the old gold "brass")
        brass: {
          300: "#c85a38",
          400: "#c0512f",
          500: "#d8613f",
          600: "#a8421f",
        },
        // Text scale tuned for a light theme: INVERTED so the existing usage keeps
        // working (low index = strongest/darkest text, high index = faint).
        gray: {
          100: "#2a241e",
          200: "#3b342c",
          300: "#4d453b",
          400: "#6f665a",
          500: "#8c8275",
          600: "#ada393",
          700: "#bcb2a1",
          800: "#cfc6b6",
          900: "#e2dacc",
        },
      },
      fontFamily: {
        // "serif" key kept so existing `font-serif` headings restyle centrally;
        // now a modern sans display stack for a friendlier, less formal feel.
        serif: ["system-ui", "-apple-system", "'Segoe UI'", "'Noto Sans SC'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
