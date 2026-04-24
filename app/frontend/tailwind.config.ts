import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Outfit", "sans-serif"],
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        bg: {
          base: "#030712",
          surface: "#0F172A",
          elevated: "#1E293B",
        },
        border: {
          DEFAULT: "#1E293B",
          strong: "#334155",
        },
        text: {
          primary: "#F8FAFC",
          secondary: "#94A3B8",
          muted: "#64748B",
        },
        accent: {
          DEFAULT: "#00F0FF",
          dim: "rgba(0, 240, 255, 0.15)",
        },
        positive: "#10B981",
        warning: "#F59E0B",
        anomaly: "#EF4444",
        neutral: "#3B82F6",
      },
      borderRadius: {
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        panel: '0',
        full: '9999px',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow': 'conic-gradient(from 180deg at 50% 50%, rgba(138, 43, 226, 0.4) 0deg, rgba(0, 240, 255, 0.4) 180deg, rgba(138, 43, 226, 0.4) 360deg)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'border-flow': 'border-flow 3s ease infinite',
        'scan': 'scan 2s linear infinite',
        'float-y': 'float-y 4s ease-in-out infinite',
        'float-y-slow': 'float-y 6s ease-in-out infinite',
        'draw-line': 'draw-line 2.4s ease-in-out infinite',
        'scan-x': 'scan-x 2.5s linear infinite',
        'spin-slow': 'spin 10s linear infinite',
        'ping-slow': 'ping-slow 2.4s cubic-bezier(0, 0, 0.2, 1) infinite',
        'wobble': 'wobble 3s ease-in-out infinite',
        'dash-shift': 'dash-shift 1.6s linear infinite',
      },
      keyframes: {
        'border-flow': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'scan': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'float-y': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'draw-line': {
          '0%': { strokeDashoffset: '200' },
          '60%, 100%': { strokeDashoffset: '0' },
        },
        'scan-x': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '10%, 90%': { opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        'ping-slow': {
          '0%': { transform: 'scale(1)', opacity: '0.9' },
          '80%, 100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        'wobble': {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2deg)' },
        },
        'dash-shift': {
          '0%': { strokeDashoffset: '0' },
          '100%': { strokeDashoffset: '-12' },
        },
      }
    },
  },
  plugins: [],
} satisfies Config;
