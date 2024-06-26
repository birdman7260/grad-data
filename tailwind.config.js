// disabling no-undef because i don't know how to make eslint know
// that tailwind knows about require()
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
// import flowbitePlugin from 'flowbite/plugin';

// /** @type {import('tailwindcss').Config} */
// export default {
//   content: [
//     './index.html',
//     './src/**/*.{js,ts,jsx,tsx}',
//     './node_modules/flowbite/**/*.js',
//   ],
//   // theme: {
//   //   container: {
//   //     center: true,
//   //   },
//   //   extend: {},
//   // },
//   plugins: [require('daisyui'), flowbitePlugin({ charts: true })],
// };

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  plugins: [require('daisyui')],
};
