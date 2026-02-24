/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ["var(--font-outfit)", "sans-serif"],
                mono: ["var(--font-jetbrains)", "monospace"],
            },
            colors: {
                brand: {
                    50: "#f0fdf4",
                    100: "#dcfce7",
                    400: "#4ade80",
                    500: "#22c55e",
                    600: "#16a34a",
                },
                crash: "#ef4444",
                surface: {
                    DEFAULT: "#0f1117",
                    card: "#161b27",
                    border: "#1e2535",
                },
            },
            keyframes: {
                "pulse-glow": {
                    "0%, 100%": { boxShadow: "0 0 20px rgba(34, 197, 94, 0.3)" },
                    "50%": { boxShadow: "0 0 50px rgba(34, 197, 94, 0.8)" },
                },
            },
            animation: {
                "pulse-glow": "pulse-glow 1.5s ease-in-out infinite",
            },
        },
    },
    plugins: [],
};
