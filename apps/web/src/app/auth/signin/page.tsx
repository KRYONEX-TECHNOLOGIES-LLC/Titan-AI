'use client';

import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  );
}

function TitanLogo() {
  return (
    <div className="flex items-center gap-3 mb-8">
      <div className="w-12 h-12 bg-[#007acc] rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-[#007acc]/20">
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
  const error = searchParams.get('error');
  const [loading, setLoading] = useState<string | null>(null);

  const supabase = createClient();

  const handleOAuthSignIn = async (provider: 'github' | 'google' | 'apple') => {
    setLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : undefined,
        },
      });
      if (error) {
        console.error(`[signin] ${provider} OAuth failed:`, error.message);
        setLoading(null);
      }
    } catch {
      setLoading(null);
    }
  };

  const errorMessages: Record<string, string> = {
    OAuthSignin: 'Error starting sign-in. Please try again.',
    OAuthCallback: 'Error during callback. Please try again.',
    OAuthCreateAccount: 'Could not create account. Please try again.',
    AccessDenied: 'Access was denied. Please try again.',
    default: 'An error occurred. Please try again.',
  };

  const errorMessage = error ? (errorMessages[error] ?? errorMessages.default) : null;

  return (
    <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,122,204,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,122,204,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />

      <div className="relative w-full max-w-[420px]">
        <div className="bg-[#1a1a2e] border border-[#2d2d4e] rounded-2xl p-8 shadow-2xl">
          <TitanLogo />

          <h1 className="text-xl font-semibold text-white mb-2">Welcome to Titan AI</h1>
          <p className="text-[#808080] text-sm mb-8">
            Sign in to access your IDE, repositories, and start building with AI.
          </p>

          {errorMessage && (
            <div className="mb-6 p-3 bg-[#f85149]/10 border border-[#f85149]/30 rounded-lg text-[#f85149] text-sm">
              {errorMessage}
            </div>
          )}

          <div className="space-y-3">
            {/* Continue with GitHub */}
            <button
              onClick={() => handleOAuthSignIn('github')}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#24292f] hover:bg-[#32383f] disabled:opacity-60 text-white font-medium rounded-xl transition-all duration-150 border border-[#3c3c3c]"
            >
              {loading === 'github' ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <GitHubIcon />
              )}
              <span>Continue with GitHub</span>
            </button>

            {/* Continue with Google -- official branding: white bg, Google colors */}
            <button
              onClick={() => handleOAuthSignIn('google')}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 disabled:opacity-60 text-[#3c4043] font-medium rounded-xl transition-all duration-150 border border-[#dadce0]"
            >
              {loading === 'google' ? (
                <div className="w-5 h-5 border-2 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              <span>Continue with Google</span>
            </button>

            {/* Continue with Apple -- official branding: black bg, white text + Apple logo */}
            <button
              onClick={() => handleOAuthSignIn('apple')}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-black hover:bg-[#1a1a1a] disabled:opacity-60 text-white font-medium rounded-xl transition-all duration-150 border border-[#333]"
            >
              {loading === 'apple' ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <AppleIcon />
              )}
              <span>Continue with Apple</span>
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-[#2d2d4e]">
            <div className="flex items-start gap-2.5 text-[12px] text-[#666]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0 text-[#555]">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span>Your data is encrypted and secured. We only request the minimum permissions needed.</span>
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-[#555]">
            By continuing, you agree to our{' '}
            <a href="/terms" className="text-[#007acc] hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="text-[#007acc] hover:underline">Privacy Policy</a>.
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
