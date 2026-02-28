'use client';

const PILLARS = [
  {
    title: 'Voice + Text',
    description:
      'Talk or type. Alfred responds with a natural ElevenLabs voice and understands context across conversations. Persistent memory means he remembers you.',
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    title: 'Full IDE Control',
    description:
      'Alfred reads and writes files, runs commands, commits and pushes code, searches your project, and controls protocols — all real execution, not simulated.',
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
  },
  {
    title: '24/7 Daemon Mode',
    description:
      'Optional always-on background service. Text Alfred from Telegram, Discord, or WhatsApp even when the app is closed. He works overnight and pings you when done.',
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12.75h.007v.008H12v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
];

const EXTRAS = [
  'Smart device control (thermostat, lights, cameras, locks)',
  'Messaging channels: Telegram, Discord, Slack, WhatsApp',
  'Spawn subagents for parallel background tasks',
  'Persistent brain memory + personal user profile',
  'Self-improvement loop — learns from every interaction',
  'Nexus add-on ecosystem for community extensions',
];

const ACTIVITY_FEED = [
  { type: 'user', text: 'Hey Alfred, run the tests and push if they pass' },
  { type: 'tool', name: 'run_command', status: 'done', detail: 'npm test — 47 passed, 0 failed' },
  { type: 'tool', name: 'git_commit', status: 'done', detail: '"v0.3.72: all tests passing"' },
  { type: 'tool', name: 'git_push', status: 'done', detail: 'origin/main — pushed' },
  { type: 'alfred', text: 'All 47 tests passed. Committed and pushed to main, sir.' },
  { type: 'tool', name: 'message_send', status: 'done', detail: 'Telegram — "Deploy complete"' },
];

export function AlfredSpotlight() {
  return (
    <section id="alfred" className="relative py-24 px-6">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-px bg-gradient-to-r from-transparent via-[#8b5cf6]/20 to-transparent" />

      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-[#10b981] tracking-wide uppercase mb-3">
            AI Assistant
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Meet Alfred — Your AI That Never Sleeps
          </h2>
          <p className="mt-4 text-[#8888a0] max-w-2xl mx-auto">
            Alfred is a voice and text AI assistant with full control over the Titan IDE.
            He reads files, runs commands, pushes code, controls your smart home, and messages you on Telegram.
            Optionally, he runs 24/7 as a background daemon — even when the app is closed.
          </p>
        </div>

        {/* 3-column pillars */}
        <div className="grid gap-6 sm:grid-cols-3 mb-16">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="group rounded-2xl border border-[#1f1f35] bg-[#0c0c18]/50 p-7 hover:border-[#10b981]/30 hover:bg-[#0c0c18] transition-all duration-300"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#10b981]/20 to-[#059669]/20 flex items-center justify-center text-[#10b981] mb-5 group-hover:from-[#10b981]/30 group-hover:to-[#059669]/30 transition-colors">
                {p.icon}
              </div>
              <h3 className="text-base font-semibold text-white mb-2">{p.title}</h3>
              <p className="text-sm text-[#8888a0] leading-relaxed">{p.description}</p>
            </div>
          ))}
        </div>

        {/* Activity feed mockup + extras */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Activity feed */}
          <div className="rounded-2xl border border-[#1f1f35] bg-[#0a0a14] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-[#1f1f35] bg-[#0c0c18]">
              <div className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-pulse" />
              <span className="text-xs font-medium text-[#8888a0] uppercase tracking-wider">
                Alfred Activity Feed
              </span>
            </div>
            <div className="p-4 space-y-3 text-sm">
              {ACTIVITY_FEED.map((item, i) => {
                if (item.type === 'user') {
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="shrink-0 w-6 h-6 rounded-full bg-[#3b82f6]/20 flex items-center justify-center text-[10px] font-bold text-[#3b82f6]">
                        U
                      </div>
                      <p className="text-[#d2d2e2] leading-relaxed">{item.text}</p>
                    </div>
                  );
                }
                if (item.type === 'alfred') {
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="shrink-0 w-6 h-6 rounded-full bg-[#10b981]/20 flex items-center justify-center text-[10px] font-bold text-[#10b981]">
                        A
                      </div>
                      <p className="text-[#d2d2e2] leading-relaxed">{item.text}</p>
                    </div>
                  );
                }
                return (
                  <div key={i} className="flex items-center gap-2 pl-9 text-xs">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-[#10b981]">
                      <path d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="text-[#8b5cf6] font-mono">{item.name}</span>
                    <span className="text-[#5f5f75]">&mdash;</span>
                    <span className="text-[#8888a0]">{item.detail}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Extra capabilities */}
          <div className="flex flex-col justify-center">
            <h3 className="text-lg font-semibold text-white mb-5">
              Beyond a chatbot — a true digital agent
            </h3>
            <ul className="space-y-3">
              {EXTRAS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-[#8888a0]">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-[#10b981] mt-0.5 shrink-0">
                    <path d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="#comparison"
              className="inline-flex items-center gap-2 mt-8 text-sm font-medium text-[#10b981] hover:text-[#34d399] transition-colors"
            >
              Compare Desktop vs Always-On
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
