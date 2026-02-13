/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Fraunces', 'serif'],
        body: ['Manrope', 'sans-serif'],
      },
      colors: {
        ink: {
          900: '#1b1b1b',
          800: '#2a2a2a',
          700: '#3d3d3d',
        },
        sand: {
          50: '#f7f4ef',
          100: '#efe7dc',
          200: '#e4d7c6',
        },
        tide: {
          100: '#d9e8ef',
          200: '#c1d7e2',
          300: '#9dbacb',
          600: '#466a7a',
        },
      },
      boxShadow: {
        lift: '0 18px 45px -30px rgba(20, 34, 44, 0.45)',
      },
      keyframes: {
        floatIn: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        floatIn: 'floatIn 0.7s ease-out both',
        shimmer: 'shimmer 8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

