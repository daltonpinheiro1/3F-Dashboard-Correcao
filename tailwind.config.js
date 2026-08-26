/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '400px',
      },
      colors: {
        brand: {
          navy: '#0f234b',
          blue: '#0D5CFF',
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
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeInUp 0.4s ease-out forwards',
        'score-in': 'countUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
