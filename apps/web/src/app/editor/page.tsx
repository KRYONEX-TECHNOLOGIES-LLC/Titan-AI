// Editor Page
// apps/web/src/app/editor/page.tsx

'use client';

import { Suspense } from 'react';
import nextDynamic from 'next/dynamic';
import { EditorLoading } from '@/components/editor-loading';

export const dynamic = 'force-dynamic';

// Dynamically import the editor to avoid SSR issues with Monaco
const EditorWorkspace = nextDynamic(
  () => import('@/components/editor-workspace').then((mod) => mod.EditorWorkspace),
  {
    ssr: false,
    loading: () => <EditorLoading />,
  }
);

export default function EditorPage() {
  return (
    <Suspense fallback={<EditorLoading />}>
      <EditorWorkspace />
    </Suspense>
  );
}
