/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * One brand colour, defined once.
         *
         * Every button, link and accent in the app refers to `brand` rather
         * than a hex value, so the whole palette moves from here — which is
         * why switching from blue to pink was one edit rather than forty.
         *
         * `soft` is for tinted backgrounds (badges, hero, active states) where
         * the full-strength colour would shout.
         */
        brand: {
          DEFAULT: '#db2777',
          dark: '#be185d',
          light: '#f472b6',
          soft: '#fce7f3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Lifts the search card off the hero behind it.
        card: '0 10px 30px -12px rgb(0 0 0 / 0.25)',
      },
    },
  },
  plugins: [],
};
