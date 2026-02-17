// Editor Page
// apps/web/src/app/editor/page.tsx

'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { EditorLoading } from '@/components/editor-loading';

// Dynamically import the editor to avoid SSR issues with Monaco
const EditorWorkspace = dynamic(
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
