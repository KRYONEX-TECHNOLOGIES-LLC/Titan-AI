import Link from 'next/link';

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-xs text-[#5f5f75] mb-10">Last updated: February 2026</p>

        <div className="space-y-8 text-sm text-[#a0a0b8] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Local-First Architecture</h2>
            <p>
              Titan Desktop runs locally on your machine. Files, commands, and tool actions are executed
              on your computer unless you explicitly use remote API providers. We do not collect, store,
              or transmit your code to our servers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Third-Party API Providers</h2>
            <p>
              When you use AI model features, requests are sent to the model providers you configure
              (e.g., OpenRouter, Anthropic, OpenAI) using your own API keys. These requests are governed
              by the respective provider&apos;s privacy policy. We recommend reviewing your provider&apos;s data
              handling practices.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Data Handling</h2>
            <p>
              Titan Desktop does not send telemetry, analytics, or usage data to KRYONEX TECHNOLOGIES servers.
              Application settings and session metadata are stored locally on your machine to improve
              reliability and UX. You can clear local state by resetting app storage in your environment.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">GitHub Authentication</h2>
            <p>
              If you choose to sign in with GitHub, we use OAuth to authenticate. We request access to
              your profile information and repositories as disclosed during the sign-in flow. Your GitHub
              token is stored locally and never transmitted to our servers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Contact</h2>
            <p>
              For privacy-related questions, contact KRYONEX TECHNOLOGIES LLC.
            </p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1f1f35]">
        <div className="mx-auto max-w-3xl px-6 py-6 flex items-center justify-between text-xs text-[#5f5f75]">
          <span>&copy; {new Date().getFullYear()} KRYONEX TECHNOLOGIES LLC</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/release-notes" className="hover:text-white transition-colors">Release Notes</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
