import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#06060b] text-[#e6e6ef]">
      {/* Nav */}
      <nav className="border-b border-[#1f1f35]">
        <div className="mx-auto max-w-3xl px-6 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#3b82f6]" />
            <span className="text-sm font-semibold text-white">Titan AI</span>
          </Link>
          <Link href="/" className="text-xs text-[#8888a0] hover:text-white transition-colors">
            Back to home
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-xs text-[#5f5f75] mb-10">Last updated: February 2026</p>

        <div className="space-y-8 text-sm text-[#a0a0b8] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By downloading, installing, or using Titan Desktop (&ldquo;the Software&rdquo;), you agree to be bound
              by these Terms of Service. If you do not agree, do not use the Software.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. License and Use</h2>
            <p>
              Titan Desktop is provided by KRYONEX TECHNOLOGIES LLC for authorized use as a professional
              developer tool. You are granted a non-exclusive, non-transferable license to use the Software.
              Redistribution, reverse engineering for malicious use, or abuse of integrated automation
              features is prohibited.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. API Keys and Third-Party Services</h2>
            <p>
              Titan Desktop connects to third-party AI model providers (e.g., OpenRouter, Anthropic, OpenAI)
              using API keys you provide. You are responsible for complying with those providers&apos; terms.
              KRYONEX TECHNOLOGIES is not liable for charges incurred through your API usage.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Disclaimer</h2>
            <p>
              Titan Desktop is provided &ldquo;as-is&rdquo; without warranty of any kind. You are responsible for
              verifying generated code, security, and release outcomes before deploying to production
              environments. KRYONEX TECHNOLOGIES LLC shall not be liable for any damages arising from
              use of the Software.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Contact</h2>
            <p>
              For questions about these terms, contact KRYONEX TECHNOLOGIES LLC.
            </p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1f1f35]">
        <div className="mx-auto max-w-3xl px-6 py-6 flex items-center justify-between text-xs text-[#5f5f75]">
          <span>&copy; {new Date().getFullYear()} KRYONEX TECHNOLOGIES LLC</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/release-notes" className="hover:text-white transition-colors">Release Notes</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
