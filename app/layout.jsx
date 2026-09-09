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
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                            function gfIsStaleBuildError(msg) {
                                if (!msg) return false;
                                return /ChunkLoadError|Loading chunk [\\d]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(msg);
                            }
                            function gfRecoverFromStaleBuild() {
                                try {
                                    var key = 'gf_stale_build_reload_at';
                                    var last = Number(sessionStorage.getItem(key) || 0);
                                    var now = Date.now();
                                    // One auto-reload per 15s per tab — heals a stale tab after a
                                    // server/deploy restart without looping forever if something
                                    // else is genuinely broken.
                                    if (now - last < 15000) return;
                                    sessionStorage.setItem(key, String(now));
                                    window.location.reload();
                                } catch (e) {
                                    window.location.reload();
                                }
                            }
                            window.addEventListener('error', function(e) {
                                if (e.filename && (e.filename.includes('chrome-extension://') || e.filename.includes('moz-extension://'))) {
                                    e.stopImmediatePropagation();
                                    return;
                                }
                                if (gfIsStaleBuildError(e.message) || (e.error && gfIsStaleBuildError(e.error.message))) {
                                    gfRecoverFromStaleBuild();
                                }
                            }, true);
                            window.addEventListener('unhandledrejection', function(e) {
                                var msg = e.reason && (e.reason.message || e.reason.stack || String(e.reason));
                                if (msg && (msg.includes('chrome-extension://') || msg.includes('moz-extension://'))) {
                                    e.stopImmediatePropagation();
                                    return;
                                }
                                if (gfIsStaleBuildError(msg)) {
                                    gfRecoverFromStaleBuild();
                                }
                            }, true);
                        `
                    }}
                />
            </head>
            <body className={inter.className} suppressHydrationWarning>
                <ClientLayoutWrapper>{children}</ClientLayoutWrapper>
            </body>

        </html>
    );
}
