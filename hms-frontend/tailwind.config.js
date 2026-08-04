/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // DHS brand palette, sampled directly from the logo:
        // navy #283891 (dark/primary end) and cyan #00aeef (accent).
        dhs: {
          50: "#eef6fd",
          100: "#d7ecfb",
          200: "#aed9f7",
          300: "#7cc2f3",
          400: "#2fbdee",
          500: "#00aeef",
          600: "#0f7fd6",
          700: "#1a55b0",
          800: "#243480",
          900: "#1a2760",
        },
      },
    },
  },
  plugins: [],
};
