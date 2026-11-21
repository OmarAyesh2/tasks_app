/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Poppins', 'sans-serif'],
            },
            screens: {
                fold: '720px',
            },
            boxShadow: {
                'soft': '0 4px 24px -2px rgba(0, 0, 0, 0.07)',
                'soft-hover': '0 12px 32px -4px rgba(8, 145, 178, 0.15), 0 4px 12px -2px rgba(0, 0, 0, 0.08)',
                'glow': '0 0 20px rgba(8, 145, 178, 0.4)',
            },
            colors: {
                background: '#F8FBFF',
                surface: '#FFFFFF',
                primary: {
                    DEFAULT: '#0891B2',
                    hover: '#0E7490',
                },
                text: {
                    main: '#0F172A',
                    muted: '#475569',
                },
                dark: {
                    bg: '#050D1A',
                    surface: '#0A1628',
                    border: '#1A3A5C',
                }
            },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-out',
                'slide-in': 'slideIn 0.3s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideIn: {
                    '0%': { transform: 'translateX(-20px)', opacity: '0' },
                    '100%': { transform: 'translateX(0)', opacity: '1' },
                }
            }
        },
    },
    plugins: [],
}
