/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          bg: '#141414',
          surface: '#1a1a1a',
          raised: '#202020',
          overlay: '#252525',
          border: '#2b2b2b',
          hover: '#2a2a2a'
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#60a5fa',
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
      boxShadow: {
        panel: '0 1px 2px 0 rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)',
        floating: '0 8px 30px rgba(0,0,0,0.5)'
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'scale-in': 'scaleIn 120ms ease-out',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        'toast-in': 'toastIn 280ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pop-in': 'popIn 360ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        indeterminate: 'indeterminateBar 1.4s ease-in-out infinite',
        'pulse-ring': 'pulseRing 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-fade-in': 'slideFadeIn 220ms cubic-bezier(0.16, 1, 0.3, 1)'
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        scaleIn: { from: { opacity: 0, transform: 'scale(0.97)' }, to: { opacity: 1, transform: 'scale(1)' } },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' }
        },
        toastIn: {
          from: { opacity: 0, transform: 'translateY(10px) scale(0.94)' },
          to: { opacity: 1, transform: 'translateY(0) scale(1)' }
        },
        popIn: {
          '0%': { opacity: 0, transform: 'scale(0.5)' },
          '60%': { opacity: 1, transform: 'scale(1.08)' },
          '100%': { opacity: 1, transform: 'scale(1)' }
        },
        indeterminateBar: {
          '0%': { left: '-35%', width: '35%' },
          '50%': { left: '25%', width: '55%' },
          '100%': { left: '100%', width: '35%' }
        },
        pulseRing: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(59,130,246,0.35)' },
          '50%': { boxShadow: '0 0 0 8px rgba(59,130,246,0)' }
        },
        slideFadeIn: {
          from: { opacity: 0, transform: 'translateY(6px)' },
          to: { opacity: 1, transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: []
}
