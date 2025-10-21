/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /**
         * These semantic colors define the overall palette for the site.  
         * Feel free to tweak them to fit your brand; they represent a dark,
         * modern aesthetic with bright accents for calls to action.  
         * The background and foreground keys ensure text is legible on top
         * of dark surfaces.  See `tailwind.config.js` docs for customization.
         */
        primary: '#0D9488',
        secondary: '#F43F5E',
        accent: '#C084FC',
        background: '#0F172A',
        foreground: '#F8FAFC',
      },
    },
  },
  plugins: [],
};