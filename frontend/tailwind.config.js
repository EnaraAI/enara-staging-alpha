// Tailwind CSS, compiled at build time (lms-speed-3). Same version (3.4.17) and the same theme as the
// former in-browser compiler (cdn.tailwindcss.com with the inline tailwind.config in index.html).
// "Campus" theme: the app's teal/indigo/cyan utility classes resolve to the Campus blue scale.
const blue = { 50: '#eef4ff', 100: '#dbe7fd', 200: '#bcd3f7', 300: '#8fb4f0', 400: '#5b8fe6', 500: '#2a6edc', 600: '#0056D2', 700: '#00419e', 800: '#0b3d91', 900: '#0b2a63', 950: '#071530' };

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './*.{ts,tsx}', './{components,pages,kids,parents,bus,services}/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { teal: blue, indigo: blue, cyan: blue },
      fontFamily: { sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'] },
    },
  },
};
