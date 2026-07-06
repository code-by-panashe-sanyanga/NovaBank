/** @type {import('tailwindcss').Config} */
module.exports = {
  // class strategy so the theme toggle can switch dark mode on and off
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // brand colours - picked a teal/emerald pair so it doesn't look
        // like every other blue banking site
        brand: {
          50: "#effefa",
          100: "#c8fff0",
          200: "#92fee3",
          300: "#53f5d3",
          400: "#20e2bf",
          500: "#07c6a6",
          600: "#02a088",
          700: "#067f6e",
          800: "#0a6459",
          900: "#0d534a",
          950: "#00332e"
        },
        ink: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d4d9e3",
          300: "#aeb8ca",
          400: "#8292ac",
          500: "#637592",
          600: "#4e5d79",
          700: "#404c62",
          800: "#384153",
          900: "#323947",
          950: "#15181f"
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-space)", "system-ui", "sans-serif"]
      },
      boxShadow: {
        card: "0 1px 2px rgba(21, 24, 31, 0.04), 0 8px 24px rgba(21, 24, 31, 0.06)",
        "card-dark": "0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.35)"
      }
    },
  },
  plugins: [],
};
