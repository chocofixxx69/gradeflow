'use client';

import { createContext, useContext } from 'react';

const ThemeContext = createContext({
    theme: 'light',
    toggleTheme: () => { },
});

export const useTheme = () => useContext(ThemeContext);

export default function ThemeProvider({ children }) {
    return (
        <ThemeContext.Provider value={{ theme: 'light', toggleTheme: () => {} }}>
            {children}
        </ThemeContext.Provider>
    );
}
