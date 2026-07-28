/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          bg: '#0f0f10',
          surface: '#161617',
          raised: '#1c1c1e',
          overlay: '#232325',
          border: '#2a2a2c',
          hover: '#28282a'
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#60a5fa',
          soft: '#93c5fd',
          muted: '#1e3a5f'
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI Variable"',
          '"Segoe UI"',
          'Inter',
          'system-ui',
          'sans-serif'
        ]
      },
      backgroundImage: {
        'radial-fade': 'radial-gradient(60% 60% at 50% 0%, rgba(59,130,246,0.25) 0%, rgba(15,15,16,0) 70%)',
        'grid-lines':
          'linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' }
        },
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px) translateX(0px)' },
          '50%': { transform: 'translateY(-22px) translateX(10px)' }
        },
        blob: {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -40px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.95)' }
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' }
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' }
        }
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'floatSlow 9s ease-in-out infinite',
        blob: 'blob 18s ease-in-out infinite',
        'blob-delay': 'blob 18s ease-in-out infinite 6s',
        marquee: 'marquee 28s linear infinite',
        shimmer: 'shimmer 1.8s ease-in-out infinite',
        'gradient-shift': 'gradientShift 8s ease infinite'
      }
    }
  },
  plugins: []
}
