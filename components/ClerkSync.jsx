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
        // Dynamically import useUser to avoid crashes when outside ClerkProvider
        let cancelled = false;
        
        import('@clerk/nextjs').then(({ useUser }) => {
            // This won't work as a hook call outside React — 
            // so we use the Clerk client-side API instead
        }).catch(() => {
            // Clerk not available, skip
        });

        // Alternative: use Clerk's window-based API if available
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

                const encoder = new TextEncoder();
                const data = encoder.encode((usn + profile.id) + '_gradeflow_secret_v1_2026');
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const sig = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                localStorage.setItem('student_session', JSON.stringify({
                    usn,
                    id: profile.id,
                    name: profile.name || name,
                    role: 'student',
                    signature: sig
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
