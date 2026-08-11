'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
    theme: 'light',
    toggleTheme: () => { },
});

export const useTheme = () => useContext(ThemeContext);

export default function ThemeProvider({ children }) {
    const [theme, setTheme] = useState('light');

    useEffect(() => {
        // 1. Check saved preference
        const stored = localStorage.getItem('theme');
        if (stored) {
            apply(stored);
            return;
        }
        // 2. Auto-detect browser preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        apply(prefersDark ? 'dark' : 'light');

        // 3. Listen for OS-level changes
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e) => {
            if (!localStorage.getItem('theme')) {
                apply(e.matches ? 'dark' : 'light');
            }
        };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    const apply = (t) => {
        setTheme(t);
        document.documentElement.setAttribute('data-theme', t);
    };

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        apply(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
