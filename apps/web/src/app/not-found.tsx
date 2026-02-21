import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#06060b] flex items-center justify-center">
      <div className="text-center px-6">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#3b82f6]" />
          <span className="text-lg font-semibold text-white">Titan AI</span>
        </div>
        <h1 className="text-6xl font-bold text-white mb-2">404</h1>
        <p className="text-sm text-[#8888a0] mb-8">This page doesn&apos;t exist.</p>
        <Link
          href="/"
          className="inline-flex rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#3b82f6] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
