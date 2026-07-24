/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,ts}'
  ],
  theme: {
    extend: {
      colors: {
        // High-contrast, non-green palette
        ink: {
          DEFAULT: '#152033',
          soft: '#3d4f66',
          mute: '#6b7c90'
        },
        midnight: {
          50: '#eef3ff',
          100: '#dce6ff',
          200: '#b8ccff',
          300: '#85a6ff',
          400: '#4d7aff',
          500: '#2a57ef',
          600: '#1c3fd2',
          700: '#1833a8',
          800: '#182d86',
          900: '#0f1b3d',
          950: '#0a1228'
        },
        coral: {
          50: '#fff4f1',
          100: '#ffe6df',
          200: '#ffc9bb',
          300: '#ffa48d',
          400: '#ff7a5c',
          500: '#f25535',
          600: '#db3a1c',
          700: '#b72e16',
          800: '#972a18',
          900: '#7c2719'
        },
        skywash: {
          50: '#f4f9fc',
          100: '#e7f1f8',
          200: '#cfe3f1',
          300: '#a8cce4'
        },
        sand: {
          50: '#fbf8f3',
          100: '#f3ece1',
          200: '#e6d8c4'
        }
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'soft-pulse': {
          '0%, 100%': { boxShadow: 'inset 3px 0 0 #f25535' },
          '50%': { boxShadow: 'inset 3px 0 0 #ff7a5c, 0 0 0 4px rgba(242, 85, 53, 0.12)' }
        }
      },
      animation: {
        'fade-up': 'fade-up 0.45s ease-out both',
        'soft-pulse': 'soft-pulse 2s ease-in-out infinite'
      },
      boxShadow: {
        panel: '0 12px 40px rgba(15, 27, 61, 0.10)',
        lift: '0 8px 24px rgba(15, 27, 61, 0.12)',
        glow: '0 0 0 3px rgba(242, 85, 53, 0.22)'
      },
      borderRadius: {
        panel: '1rem',
        chip: '0.7rem'
      }
    }
  },
  plugins: []
};
