'use client';

import { usePathname } from 'next/navigation';
import { ClerkProvider } from '@clerk/nextjs';

/**
 * SafeClerkProvider — wraps children in ClerkProvider ONLY on routes
 * that actually need Clerk authentication (/sign-in, /sign-up).
 *
 * All other pages use custom localStorage-based sessions (AuthGuard).
 * This prevents Clerk from making server-side API calls on every
 * page load, which was causing 500: INTERNAL_SERVER_ERROR when
 * Clerk's API was unreachable or keys were invalid.
 */
export default function SafeClerkProvider({ children }) {
    const pathname = usePathname();
    const needsClerk = pathname?.startsWith('/sign-in') || pathname?.startsWith('/sign-up');

    if (needsClerk) {
        return <ClerkProvider>{children}</ClerkProvider>;
    }

    // For all other routes, render children without Clerk
    return <>{children}</>;
}
