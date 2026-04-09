/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Feminine theme
        rose: { primary: "#E91E8C", light: "#FFD6EC", dark: "#9C27B0" },
        // Masculine theme (via dark mode)
        slate: { primary: "#2196F3", surface: "#1A2533", bg: "#0F1923" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "1rem", "2xl": "1.5rem" },
    },
  },
  plugins: [],
};
