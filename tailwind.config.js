// disabling no-undef because i don't know how to make eslint know
// that tailwind knows about require()
/* eslint-disable no-undef */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
    },
    extend: {},
  },
  plugins: [require('daisyui')],
};
