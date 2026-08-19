import ThemeProvider from '../components/ThemeProvider';
import ClientLayoutWrapper from '../components/ClientLayoutWrapper';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700', '800'],
    variable: '--font-jakarta',
});

// Root metadata should be in Server Components
export const metadata = {
    title: 'GradeFlow — Academic Intelligence',
    description: 'GradeFlow — Track marks, calculate SGPA and CGPA, and manage your academic record.',
};

// viewport-fit=cover is what makes every env(safe-area-inset-*) rule in
// globals.css resolve to a real value on notched/Dynamic Island iPhones —
// without it they silently resolve to 0.
export const viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <link
                    href="https://fonts.googleapis.com/icon?family=Material+Icons+Round"
                    rel="stylesheet"
                />
                {/* Instantly apply saved theme before React hydration to prevent flicker */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
                    }}
                />
            </head>
            <body className={jakarta.className}>
                <ThemeProvider>
                    <ClientLayoutWrapper>{children}</ClientLayoutWrapper>
                </ThemeProvider>
            </body>
        </html>
    );
}
