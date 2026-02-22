// Editor Page
// apps/web/src/app/editor/page.tsx

'use client';

import { Suspense } from 'react';
import nextDynamic from 'next/dynamic';
import { EditorLoading } from '@/components/editor-loading';

export const dynamic = 'force-dynamic';

const TitanIDE = nextDynamic(
  () => import('@/components/titan-ide'),
  {
    ssr: false,
    loading: () => <EditorLoading />,
  }
);

export default function EditorPage() {
  return (
    <Suspense fallback={<EditorLoading />}>
      <TitanIDE />
    </Suspense>
  );
}
