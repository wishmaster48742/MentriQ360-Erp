import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        page: "var(--page)",
        panel: "var(--panel)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        accent: "var(--accent)",
        "accent-strong": "var(--accent-strong)",
        "accent-soft": "var(--accent-soft)",
        info: "var(--info)",
        warning: "var(--warning)",
        danger: "var(--danger)"
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        lift: "var(--shadow-lift)"
      }
    }
  },
  plugins: []
};

export default config;
