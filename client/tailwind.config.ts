import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        white: "#0F172A",
        ink: {
          950: "#F6F7F9",
          900: "#FFFFFF",
          800: "#EEF1F5",
        },
        accent: {
          purple: "#7C3AED",
          cyan: "#0891B2",
          success: "#10B981",
          warning: "#F59E0B",
          danger: "#EF4444",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(124,58,237,0.12), 0 12px 40px rgba(124,58,237,0.14)",
        soft: "0 20px 50px rgba(15,23,42,0.10)",
        silver:
          "0 0 0 1px rgba(255,255,255,0.8), 0 10px 30px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.9)",
      },
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(circle at 8% 6%, rgba(124,58,237,0.16), transparent 34%), radial-gradient(circle at 92% 4%, rgba(139,92,246,0.13), transparent 30%), radial-gradient(circle at 55% 110%, rgba(8,145,178,0.10), transparent 40%), linear-gradient(180deg, #FFFFFF 0%, #F6F3FC 100%)",
        "silver-gradient":
          "linear-gradient(135deg, #FFFFFF 0%, #E9EDF4 45%, #A9B4C6 100%)",
        "brand-gradient":
          "linear-gradient(135deg, #7C3AED 0%, #0891B2 100%)",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        "shine-sweep": {
          "0%": { transform: "translateX(-120%) skewX(-18deg)" },
          "100%": { transform: "translateX(220%) skewX(-18deg)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "50%": { transform: "translateY(-18px) scale(1.04)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(124,58,237,0.35)" },
          "70%": { boxShadow: "0 0 0 12px rgba(124,58,237,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(124,58,237,0)" },
        },
      },
      animation: {
        "shine-sweep": "shine-sweep 1.1s ease-in-out",
        "float-slow": "float-slow 9s ease-in-out infinite",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.66, 0, 0, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;