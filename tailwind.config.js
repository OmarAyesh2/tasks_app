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
                sans: ['Inter', 'sans-serif'],
            },
            boxShadow: {
                'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
                'soft-hover': '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                'glow': '0 0 15px rgba(99, 102, 241, 0.3)',
            },
            colors: {
                background: '#F8FAFC', // Slate 50
                surface: '#FFFFFF',
                primary: {
                    DEFAULT: '#6366F1', // Indigo 500
                    hover: '#4F46E5',   // Indigo 600
                },
                text: {
                    main: '#1E293B',    // Slate 800
                    muted: '#64748B',   // Slate 500
                },
                dark: {
                    bg: '#0F172A',      // Slate 900
                    surface: '#1E293B', // Slate 800
                    border: '#334155',  // Slate 700
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
