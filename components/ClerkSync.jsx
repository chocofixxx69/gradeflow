'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter, usePathname } from 'next/navigation';

/**
 * ClerkSync — syncs Clerk user to Supabase student profile.
 * 
 * This component MUST be rendered inside a ClerkProvider.
 * It gracefully handles import errors if @clerk/nextjs is unavailable.
 */
export default function ClerkSync() {
    const router = useRouter();
    const pathname = usePathname();
    const syncTried = useRef(false);
    const [clerkReady, setClerkReady] = useState(false);
    const [clerkUser, setClerkUser] = useState(null);

    useEffect(() => {
        let cancelled = false;

        // Uses Clerk's window-based API since useUser can't be called as a
        // hook here (this component may render outside ClerkProvider).
        const checkClerk = () => {
            try {
                if (typeof window !== 'undefined' && window.Clerk) {
                    const user = window.Clerk.user;
                    if (user && !cancelled) {
                        setClerkUser(user);
                        setClerkReady(true);
                    }
                }
            } catch (e) {
                // Silently fail
            }
        };

        // Check periodically for Clerk to be ready
        const timer = setInterval(checkClerk, 1000);
        checkClerk();

        return () => { cancelled = true; clearInterval(timer); };
    }, []);

    useEffect(() => {
        if (!clerkReady || !clerkUser || syncTried.current) return;
        syncTried.current = true;

        const syncProfile = async () => {
            try {
                const email = clerkUser.primaryEmailAddress?.emailAddress;
                if (!email) return;

                const usn = email.split('@')[0].toUpperCase();
                const name = clerkUser.fullName || usn;

                let { data: profile } = await supabase
                    .from('students')
                    .select('id, name')
                    .eq('usn', usn)
                    .maybeSingle();

                if (!profile) {
                    const branchMatch = usn.match(/^\d[A-Z]{2}\d{2}([A-Z]{2,3})\d{3}$/);
                    const branch = branchMatch ? (branchMatch[1] === 'CS' ? 'CSE' : branchMatch[1]) : 'Unknown';

                    const { data: newProfile, error } = await supabase
                        .from('students')
                        .insert({ usn, name, branch, scheme: '2022' })
                        .select('id, name')
                        .single();

                    if (error) throw error;
                    profile = newProfile;
                }

                // Clerk is not configured in this app (see the sign-in/sign-up layouts and
                // .env.local.example — the Clerk keys are commented out) and there is no
                // server-side endpoint to mint a real, verifiable session signature for a
                // Clerk-authenticated identity. A session stored without one will simply
                // fail the server's signature check on every request (401), same as any
                // other invalid session — this path stays inert until Clerk is reactivated
                // and given a proper server-verified signature flow.
                localStorage.setItem('student_session', JSON.stringify({
                    usn,
                    id: profile.id,
                    name: profile.name || name,
                    role: 'student',
                }));

                if (pathname === '/sign-in' || pathname === '/sign-up') {
                    router.push('/dashboard');
                }
            } catch (err) {
                console.error("ClerkSync Error:", err);
            }
        };

        syncProfile();
    }, [clerkReady, clerkUser, pathname, router]);

    return null;
}
