/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EAF2FF',
          100: '#D0E5FF',
          200: '#A1CBFF',
          300: '#6DAFFF',
          400: '#3A92FF',
          500: '#0D5CFF',
          600: '#0A4FDB',
          700: '#0A3FB8',
          800: '#082F8C',
          900: '#071F60',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      lineHeight: {
        body: '1.5',
        heading: '1.2',
      },
      animation: {
        'fade-in': 'fadeInUp 0.4s ease-out forwards',
        'score-in': 'countUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
    },
  },
  plugins: [],
};
