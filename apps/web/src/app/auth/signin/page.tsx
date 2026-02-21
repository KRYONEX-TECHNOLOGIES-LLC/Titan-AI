'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useRef, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';

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

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
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

type AuthStep = 'email' | 'otp' | 'done';

function SignInContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const supabase = createClient();

  const handleOAuthSignIn = async (provider: 'google' | 'apple') => {
    if (!supabase) {
      setEmailError('Authentication service not configured.');
      return;
    }
    setOauthLoading(provider);
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
        setOauthLoading(null);
      }
    } catch {
      setOauthLoading(null);
    }
  };

  const handleSendOtp = async () => {
    if (!supabase) {
      setEmailError('Authentication service not configured.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailLoading(true);
    setEmailError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (error) {
        setEmailError(error.message);
      } else {
        setStep('otp');
      }
    } catch {
      setEmailError('Failed to send verification code. Try again.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...otpCode];
    newCode[index] = value;
    setOtpCode(newCode);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    if (newCode.every(d => d !== '')) {
      verifyOtp(newCode.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      const newCode = pasted.split('');
      setOtpCode(newCode);
      otpRefs.current[5]?.focus();
      verifyOtp(pasted);
    }
  };

  const verifyOtp = async (code: string) => {
    if (!supabase) return;
    setEmailLoading(true);
    setEmailError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: 'email',
      });
      if (error) {
        setEmailError('Invalid code. Please try again.');
        setOtpCode(['', '', '', '', '', '']);
        otpRefs.current[0]?.focus();
      } else {
        setStep('done');
        window.location.href = '/editor';
      }
    } catch {
      setEmailError('Verification failed. Try again.');
    } finally {
      setEmailLoading(false);
    }
  };

  const errorMessages: Record<string, string> = {
    OAuthSignin: 'Error starting sign-in. Please try again.',
    OAuthCallback: 'Error during callback. Please try again.',
    OAuthCreateAccount: 'Could not create account. Please try again.',
    AccessDenied: 'Access was denied. Please try again.',
    AuthNotConfigured: 'Authentication not configured. Contact support.',
    default: 'An error occurred. Please try again.',
  };

  const errorMessage = error ? (errorMessages[error] ?? errorMessages.default) : null;

  return (
    <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,122,204,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,122,204,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />

      <div className="relative w-full max-w-[440px]">
        <div className="bg-[#1a1a2e] border border-[#2d2d4e] rounded-2xl p-8 shadow-2xl">
          <TitanLogo />

          <h1 className="text-xl font-semibold text-white mb-2">Welcome to Titan AI</h1>
          <p className="text-[#808080] text-sm mb-6">
            Sign in to access your IDE and start building with AI.
          </p>

          {errorMessage && (
            <div className="mb-5 p-3 bg-[#f85149]/10 border border-[#f85149]/30 rounded-lg text-[#f85149] text-sm">
              {errorMessage}
            </div>
          )}

          {/* Email OTP Section */}
          {step === 'email' && (
            <div className="mb-6">
              <label className="block text-[13px] text-[#999] mb-2 font-medium">Email address</label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]">
                    <MailIcon />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setEmailError(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleSendOtp(); }}
                    placeholder="you@example.com"
                    className="w-full pl-11 pr-4 py-3 bg-[#12122a] border border-[#2d2d4e] focus:border-[#007acc] rounded-xl text-white text-[14px] outline-none transition-colors placeholder:text-[#444]"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleSendOtp}
                  disabled={emailLoading || !email.trim()}
                  className="px-5 py-3 bg-[#007acc] hover:bg-[#0069b3] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl text-[14px] transition-all whitespace-nowrap"
                >
                  {emailLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Send Code'
                  )}
                </button>
              </div>
              {emailError && (
                <p className="mt-2 text-[12px] text-[#f85149]">{emailError}</p>
              )}
            </div>
          )}

          {step === 'otp' && (
            <div className="mb-6">
              <p className="text-[13px] text-[#999] mb-1">
                We sent a 6-digit code to <span className="text-white font-medium">{email}</span>
              </p>
              <button
                onClick={() => { setStep('email'); setOtpCode(['', '', '', '', '', '']); setEmailError(null); }}
                className="text-[12px] text-[#007acc] hover:underline mb-4 inline-block"
              >
                Change email
              </button>

              <div className="flex gap-2 justify-center mb-3" onPaste={handleOtpPaste}>
                {otpCode.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-bold bg-[#12122a] border border-[#2d2d4e] focus:border-[#007acc] rounded-xl text-white outline-none transition-colors"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {emailLoading && (
                <div className="flex items-center justify-center gap-2 text-[13px] text-[#808080]">
                  <div className="w-4 h-4 border-2 border-[#007acc] border-t-transparent rounded-full animate-spin" />
                  Verifying...
                </div>
              )}
              {emailError && (
                <p className="text-center text-[12px] text-[#f85149] mt-2">{emailError}</p>
              )}

              <button
                onClick={handleSendOtp}
                disabled={emailLoading}
                className="mt-3 w-full text-center text-[12px] text-[#666] hover:text-[#007acc] transition-colors disabled:opacity-50"
              >
                Didn&#39;t receive it? Resend code
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="mb-6 flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-[#3fb950]/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="text-white font-medium">Signed in successfully</p>
              <p className="text-[#808080] text-sm">Redirecting to IDE...</p>
            </div>
          )}

          {/* Divider */}
          {step === 'email' && (
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-[#2d2d4e]" />
              <span className="text-[12px] text-[#555] uppercase tracking-widest">or continue with</span>
              <div className="flex-1 h-px bg-[#2d2d4e]" />
            </div>
          )}

          {/* OAuth Buttons */}
          {step === 'email' && (
            <div className="space-y-3">
              <button
                onClick={() => handleOAuthSignIn('google')}
                disabled={oauthLoading !== null}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 disabled:opacity-60 text-[#3c4043] font-medium rounded-xl transition-all duration-150 border border-[#dadce0]"
              >
                {oauthLoading === 'google' ? (
                  <div className="w-5 h-5 border-2 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                <span>Continue with Google</span>
              </button>

              <button
                onClick={() => handleOAuthSignIn('apple')}
                disabled={oauthLoading !== null}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-black hover:bg-[#1a1a1a] disabled:opacity-60 text-white font-medium rounded-xl transition-all duration-150 border border-[#333]"
              >
                {oauthLoading === 'apple' ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <AppleIcon />
                )}
                <span>Continue with Apple</span>
              </button>
            </div>
          )}

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
