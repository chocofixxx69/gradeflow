import { NextResponse } from "next/server";

/**
 * Middleware — lightweight pass-through.
 * 
 * Clerk is NO LONGER used in middleware. The ClerkProvider is loaded
 * only inside /sign-in and /sign-up route layouts. All other routes
 * use custom AuthGuard components with localStorage-based sessions.
 * 
 * This eliminates the 500: INTERNAL_SERVER_ERROR / MIDDLEWARE_INVOCATION_FAILED
 * that occurred when Clerk SDK tried to initialize on every request and
 * failed due to network issues or invalid API keys.
 */
export function middleware(req) {
    return NextResponse.next();
}

export const config = {
    // Only run middleware on routes that actually need it.
    // Currently none — all auth is handled by client-side AuthGuard.
    // Keep this minimal to avoid any middleware overhead.
    matcher: [],
};
