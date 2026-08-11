'use client';

import { ClerkProvider } from '@clerk/nextjs';
import ClerkSync from '../../components/ClerkSync';

export default function SignInLayout({ children }) {
    return (
        <ClerkProvider>
            <ClerkSync />
            {children}
        </ClerkProvider>
    );
}
