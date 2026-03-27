/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  corePlugins: {
    // Preserve legacy base styles while introducing Tailwind utility classes incrementally.
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        whatsapp: {
          'dark-green': '#075E54', // Added standard WC dark-green as it wasn't explicit in fills
          'light-green': '#DCF7C5', // Light green accents (bubbles)
          'bg-chat': '#EFEFF4', // Chat page background
          'bg-main': '#F7F7F7', // Main background variant
          'bg-header': '#F6F6F6', // iOS Light background
          'blue': '#007AFF', // Action buttons
          'red': '#FF3B30', // Destructive text
        },
        text: {
          primary: '#000000',
          secondary: '#3C3C43',
          tertiary: '#8E8E93',
          muted: '#C7C7CC',
          dark: '#171717'
        }
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Text', 'SF Pro Display', 'Roboto', 'Helvetica Neue', 'sans-serif'],
      },
      borderRadius: {
        bubble: '8px',
      },
      boxShadow: {
        bubble: '0 1px 0 rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
};
