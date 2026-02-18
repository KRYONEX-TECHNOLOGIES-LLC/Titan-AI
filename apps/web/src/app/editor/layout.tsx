// Editor Layout
// apps/web/src/app/editor/layout.tsx

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Editor - Titan AI',
  description: 'AI-powered code editor with multi-agent orchestration',
};

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div suppressHydrationWarning className="h-screen w-screen overflow-hidden">
      {children}
    </div>
  );
}
