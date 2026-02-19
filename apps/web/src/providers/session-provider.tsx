'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

export default function TitanSessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={5 * 60}       // Refresh session every 5 minutes
      refetchOnWindowFocus={true}     // Re-check when user returns to tab
    >
      {children}
    </SessionProvider>
  );
}
