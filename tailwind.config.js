/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy:   "#2C4158",
          navy2:  "#24364B",
          green:  "#4CAF78",
          orange: "#F39A58",
          mint:   "#8ED6CF",
          sand:   "#FAF9F7",
        },
      },
    },
  },
  plugins: [],
};