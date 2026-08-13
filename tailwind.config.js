/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand blue carries every action; marigold is decorative only —
        // it does not have the contrast to be text.
        // Named for the role, not the hue — changing the brand colour is now
        // an edit to these four values, not a rename across every component.
        brand: '#E85555',
        'brand-dark': '#D14545',
        // Deepened purely for small text on light grounds — #EE7470 measures
        // 2.6:1 on cream, which 11px uppercase labels cannot carry.
        'brand-deep': '#B93B3B',
        'brand-tint': '#FBEDEB',
        // The brand hue at the light end, for detail on dark grounds where
        // `brand` itself has no contrast. Identity colour, never an action.
        'brand-light': '#F6A6A6',
        amber: '#D9922B',
        'amber-deep': '#A96A12',
        // Deep warm near-black for photo scrims: carries the brand into the dark
        // sections as atmosphere rather than as a detail fighting the image.
        shade: '#2A1B18',

        // Aliases, so any stray reference still lands on-palette.
        clay: '#E85555',
        'clay-dark': '#A53A32',
        'clay-tint': '#FBEDEB',
        plum: '#E85555',
        'plum-dark': '#A53A32',
        'plum-light': '#F0A79E',

        // Neutrals carry the layout.
        ink: '#211A19',
        'ink-soft': '#3A2C2A',
        slate: '#6B5F5C',
        mist: '#948784',
        line: '#E9DFD5',
        sand: '#FBF7F3',
        'sand-deep': '#F3EBE2',

        // Retained so the chat widget, date picker and owner dashboard
        // keep rendering. Not used by the marketing page any more.
        coral: '#E85555',
        'coral-dark': '#D14545',
        salmon: '#EE7470',
        'salmon-dark': '#D14545',
        orange: '#C07A2C',
        'orange-dark': '#A96A12',
        sunshine: '#D9922B',
        teal: '#3F6E70',
        'teal-dark': '#2F5456',
        purple: '#E85555',
        'purple-dark': '#A53A32',
        magenta: '#EE7470',
        mint: '#4A8C74',
        navy: '#211A19',
        'navy-light': '#3A2C2A',
        gray: '#6B5F5C',
        'gray-light': '#E9DFD5',
        cream: '#FBF7F3',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(23, 28, 38, 0.04)',
        lift: '0 12px 32px -12px rgba(23, 28, 38, 0.18)',
        frame: '0 24px 60px -24px rgba(23, 28, 38, 0.35)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'menu-in': {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        'fade-up-1': 'fade-up 0.5s ease-out 0.1s both',
        'fade-up-2': 'fade-up 0.5s ease-out 0.2s both',
        'fade-up-3': 'fade-up 0.5s ease-out 0.3s both',
        'fade-in': 'fade-in 0.2s ease-out both',
        'pop-in': 'pop-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
        'menu-in': 'menu-in 0.2s ease-out both',
      },
    },
  },
  plugins: [],
};
