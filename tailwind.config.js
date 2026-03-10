/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        coral: '#FF6B6B',
        'coral-dark': '#E85555',
        orange: '#FF8C42',
        'orange-dark': '#E67A30',
        sunshine: '#FFD93D',
        teal: '#00B4D8',
        'teal-dark': '#0096B7',
        purple: '#9B5DE5',
        'purple-dark': '#7B3FC5',
        magenta: '#F72585',
        mint: '#06D6A0',
        navy: '#1B2838',
        'navy-light': '#2D4356',
        gray: '#7A8B9A',
        'gray-light': '#F0F2F5',
        cream: '#FFFDF7',
      },
      fontFamily: {
        display: ['"Fredoka One"', 'cursive'],
        body: ['"Nunito"', 'sans-serif'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out forwards',
        'fade-up-1': 'fade-up 0.5s ease-out 0.1s forwards',
        'fade-up-2': 'fade-up 0.5s ease-out 0.2s forwards',
        'fade-up-3': 'fade-up 0.5s ease-out 0.3s forwards',
        'float': 'float 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
