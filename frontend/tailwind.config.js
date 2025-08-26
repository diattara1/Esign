const theme = require('./src/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx,html}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: theme.colors,
      fontFamily: theme.fonts,
    },
  },
  plugins: [],
};
