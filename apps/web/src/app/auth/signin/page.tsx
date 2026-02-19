'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';

function GitHubIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

function TitanLogo() {
  return (
    <div className="flex items-center gap-3 mb-8">
      <div className="w-12 h-12 bg-[#007acc] rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
        T
      </div>
      <div>
        <div className="text-2xl font-bold text-white tracking-tight">Titan AI</div>
        <div className="text-sm text-[#808080]">AI-Native IDE</div>
      </div>
    </div>
  );
}

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await signIn('github', { callbackUrl });
    } catch {
      setLoading(false);
    }
  };

  const errorMessages: Record<string, string> = {
    OAuthSignin: 'Error starting GitHub sign-in. Please try again.',
    OAuthCallback: 'Error during GitHub callback. Please try again.',
    OAuthCreateAccount: 'Could not create account. Please try again.',
    AccessDenied: 'Access was denied. Please authorize Titan AI on GitHub.',
    default: 'An error occurred. Please try again.',
  };

  const errorMessage = error ? (errorMessages[error] ?? errorMessages.default) : null;

  return (
    <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-4">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,122,204,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,122,204,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />

      {/* Card */}
      <div className="relative w-full max-w-[400px]">
        <div className="bg-[#1a1a2e] border border-[#2d2d4e] rounded-2xl p-8 shadow-2xl">
          <TitanLogo />

          <h1 className="text-xl font-semibold text-white mb-2">Welcome back</h1>
          <p className="text-[#808080] text-sm mb-8">
            Sign in with GitHub to access your repositories, commit history, and start building.
          </p>

          {/* Error message */}
          {errorMessage && (
            <div className="mb-6 p-3 bg-[#f85149]/10 border border-[#f85149]/30 rounded-lg text-[#f85149] text-sm">
              {errorMessage}
            </div>
          )}

          {/* Sign in button */}
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-100 disabled:opacity-70 text-[#1a1a2e] font-semibold rounded-xl transition-all duration-150 shadow-sm"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-[#1a1a2e] border-t-transparent rounded-full animate-spin" />
                <span>Connecting to GitHub...</span>
              </>
            ) : (
              <>
                <GitHubIcon />
                <span>Continue with GitHub</span>
              </>
            )}
          </button>

          {/* Permissions info */}
          <div className="mt-6 p-4 bg-[#0d0d1a] border border-[#2d2d4e] rounded-xl">
            <div className="text-xs text-[#808080] font-medium uppercase tracking-wider mb-3">
              Permissions requested
            </div>
            <div className="space-y-2">
              {[
                { icon: '📖', label: 'Read your profile & email' },
                { icon: '📁', label: 'Access your repositories' },
                { icon: '✍️', label: 'Commit & push code on your behalf' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-[13px] text-[#666]">
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-[#555]">
            By continuing, you agree to our Terms of Service.
            <br />
            Titan AI by{' '}
            <span className="text-[#007acc]">KRYONEX TECHNOLOGIES LLC</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#007acc] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}
