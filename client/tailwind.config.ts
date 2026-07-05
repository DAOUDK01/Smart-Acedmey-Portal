import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0B1020",
          900: "#121826",
          800: "#1B2335",
        },
        accent: {
          purple: "#7C5CFF",
          cyan: "#00D1FF",
          success: "#00E096",
          warning: "#FFB020",
          danger: "#FF5A7A",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(124,92,255,0.28), 0 20px 60px rgba(3,7,18,0.45)",
        soft: "0 20px 60px rgba(3,7,18,0.35)",
      },
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(circle at top left, rgba(124,92,255,0.24), transparent 34%), radial-gradient(circle at top right, rgba(0,209,255,0.18), transparent 30%), linear-gradient(180deg, #121826 0%, #0B1020 100%)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
