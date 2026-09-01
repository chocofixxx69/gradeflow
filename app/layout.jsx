import ClientLayoutWrapper from '../components/ClientLayoutWrapper';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-inter',
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
        <html lang="en" data-theme="light" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/icon?family=Material+Icons+Round"
                    rel="stylesheet"
                />
            </head>
            <body className={inter.className} suppressHydrationWarning>
                <ClientLayoutWrapper>{children}</ClientLayoutWrapper>
            </body>

        </html>
    );
}
