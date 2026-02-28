'use client';

const DESKTOP_FEATURES = [
  'Alfred available when the app is open',
  'Full IDE: editor, terminal, git, file explorer',
  'Multi-agent protocols (Phoenix, Supreme, Midnight, Sniper)',
  'Voice chat with Alfred (ElevenLabs or native)',
  'All tools: read/write files, run commands, search, git',
  'Brain memory + user profile',
  'Multi-model selector (Claude, GPT, Gemini, Qwen, etc.)',
  'Nexus add-on ecosystem',
];

const DAEMON_EXTRAS = [
  'Alfred runs 24/7 — even when the app is closed',
  'Message Alfred via Telegram, Discord, Slack, WhatsApp',
  'Scheduled tasks and overnight protocol runs',
  'Push notifications: "Build done", "Tests failed", status updates',
  'Smart device control from anywhere (thermostat, lights, cameras)',
  'Subagent spawning from your phone',
  'Auto-starts on boot, survives reboots',
];

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className={className}>
      <path d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

export function ComparisonSection() {
  return (
    <section id="comparison" className="relative py-24 px-6">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-px bg-gradient-to-r from-transparent via-[#8b5cf6]/20 to-transparent" />

      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-[#8b5cf6] tracking-wide uppercase mb-3">
            Compare
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Desktop App vs Desktop + Daemon
          </h2>
          <p className="mt-4 text-[#8888a0] max-w-2xl mx-auto">
            Both are free. The desktop app gives you the full IDE and Alfred when the app is open.
            Add the daemon for 24/7 access, messaging channels, and overnight automation.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Desktop card */}
          <div className="rounded-2xl border border-[#1f1f35] bg-[#0c0c18]/60 p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8b5cf6]/20 to-[#3b82f6]/20 flex items-center justify-center">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-[#8b5cf6]">
                  <path d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Titan Desktop</h3>
                <p className="text-xs text-[#10b981] font-medium">Free</p>
              </div>
            </div>
            <p className="text-sm text-[#8888a0] mb-6">
              The full AI IDE — download and go.
            </p>
            <ul className="space-y-3 flex-1">
              {DESKTOP_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-[#c8c8dc]">
                  <CheckIcon className="text-[#8b5cf6] mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="#download"
              className="mt-8 block text-center rounded-xl border border-[#8b5cf6]/40 py-3 text-sm font-medium text-[#c4b5fd] hover:bg-[#8b5cf6]/10 transition-colors"
            >
              Download Desktop
            </a>
          </div>

          {/* Daemon card */}
          <div className="relative rounded-2xl border border-[#10b981]/30 bg-[#0c0c18] p-8 flex flex-col shadow-[0_0_60px_rgba(16,185,129,0.06)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#10b981] px-3 py-0.5 text-[10px] font-bold text-[#06060b] uppercase tracking-wider">
              Recommended
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981]/20 to-[#059669]/20 flex items-center justify-center">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-[#10b981]">
                  <path d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12.75h.007v.008H12v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Desktop + Always-On Daemon</h3>
                <p className="text-xs text-[#10b981] font-medium">Free</p>
              </div>
            </div>
            <p className="text-sm text-[#8888a0] mb-6">
              Everything in Desktop, plus Alfred 24/7.
            </p>
            <div className="mb-4">
              <p className="text-xs font-medium text-[#5f5f75] uppercase tracking-wider mb-3">
                Includes all Desktop features, plus:
              </p>
              <ul className="space-y-3 flex-1">
                {DAEMON_EXTRAS.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[#c8c8dc]">
                    <CheckIcon className="text-[#10b981] mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <a
              href="#download"
              className="mt-auto block text-center rounded-xl bg-gradient-to-r from-[#10b981] to-[#059669] py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:shadow-[0_0_50px_rgba(16,185,129,0.35)] transition-all duration-300"
            >
              Get Desktop + Daemon
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-[#5f5f75] mt-8">
          Both are free, open source, and bring-your-own-API-keys. No vendor lock-in.
        </p>
      </div>
    </section>
  );
}
