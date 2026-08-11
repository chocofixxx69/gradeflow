'use client';

import { ClerkProvider } from '@clerk/nextjs';
import ClerkSync from '../../components/ClerkSync';

export default function SignUpLayout({ children }) {
    return (
        <ClerkProvider>
            <ClerkSync />
            {children}
        </ClerkProvider>
    );
}
