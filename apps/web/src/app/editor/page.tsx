// Editor Page
// apps/web/src/app/editor/page.tsx

'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import nextDynamic from 'next/dynamic';
import { EditorLoading } from '@/components/editor-loading';
import { useSession } from '@/providers/session-provider';
import { isElectron } from '@/lib/electron';

export const dynamic = 'force-dynamic';

const TitanIDE = nextDynamic(
  () => import('@/components/titan-ide'),
  {
    ssr: false,
    loading: () => <EditorLoading />,
  }
);

function EditorAuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // In Electron, Supabase may not be configured -- allow access without account sign-in.
    // The GitHub connect button handles repository auth separately.
    if (isElectron) return;

    if (status === 'unauthenticated') {
      router.replace('/auth/signin?next=/editor');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <EditorLoading />;
  }

  // On web: block until authenticated
  if (!isElectron && status === 'unauthenticated') {
    return <EditorLoading />;
  }

  return <>{children}</>;
}

export default function EditorPage() {
  return (
    <EditorAuthGuard>
      <Suspense fallback={<EditorLoading />}>
        <TitanIDE />
      </Suspense>
    </EditorAuthGuard>
  );
}
