/** @type {import('tailwindcss').Config} */
// Theme colors come from CSS variables in src/index.css (:root = light, .dark = dark),
// so one class like `bg-primary` follows the active theme.
const themed = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

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
                'soft': '0 4px 24px -2px rgb(5 15 42 / 0.07)',
                'soft-hover': '0 12px 32px -4px rgb(var(--c-primary) / 0.18), 0 4px 12px -2px rgb(5 15 42 / 0.08)',
                'glow': '0 0 24px rgb(var(--c-primary) / 0.45)',
            },
            colors: {
                background: themed('bg'),
                surface: themed('surface'),
                primary: {
                    DEFAULT: themed('primary'),
                    hover: themed('primary-hover'),
                },
                'on-primary': themed('on-primary'), // text on primary fills
                accent: themed('accent'),           // lavender
                text: {
                    main: themed('text'),
                    muted: themed('muted'),
                },
                // brand dark surfaces (used with dark: variants)
                dark: {
                    bg: '#01080F',
                    surface: '#071433',
                    border: '#1C2C52',
                },
                // navy-tinted dark greys so existing slate-700/800/900 surfaces match the palette
                slate: {
                    700: '#1C2C52',
                    800: '#0D1B3E',
                    900: '#071433',
                    950: '#050F2A',
                },
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
