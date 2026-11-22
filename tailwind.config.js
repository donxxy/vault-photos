/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Google Sans"', "Roboto", "Inter", "system-ui", "sans-serif"] },
      colors: { brand: "#1a73e8", surface: "#121212" },
    },
  },
  plugins: [],
};
