/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0f1a',
        card: '#0f172a',
        primary: {
          DEFAULT: '#3b82f6',
          foreground: '#ffffff',
        },
        accent: {
          DEFAULT: '#f97316',
          foreground: '#ffffff',
        },
      },
    },
  },
  plugins: [],
}