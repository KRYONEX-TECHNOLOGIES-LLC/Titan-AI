'use client';

const FLOW_STEPS = [
  { label: 'Supervisor', sublabel: 'Decomposes goal into lanes', color: '#8b5cf6' },
  { label: 'Workers', sublabel: 'Execute code in parallel', color: '#3b82f6' },
  { label: 'Verifiers', sublabel: '19-item ruthless checklist', color: '#f59e0b' },
  { label: 'Merge', sublabel: 'Only VERIFIED code ships', color: '#10b981' },
];

export function ProtocolSpotlight() {
  return (
    <section id="protocol" className="relative py-24 px-6">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-px bg-gradient-to-r from-transparent via-[#3b82f6]/20 to-transparent" />

      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-[#8b5cf6] tracking-wide uppercase mb-3">
            Titan Protocol
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Governance-first agent orchestration.
          </h2>
          <p className="mt-4 text-[#8888a0] max-w-2xl mx-auto">
            No code is merged without Coder output, Verifier PASS, and Supervisor approval.
            Zero-trust, fail-gate, append-only audit trail. Available in Sequential and Parallel (v2) modes.
          </p>
        </div>

        {/* Flow visualization */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0">
          {FLOW_STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center text-center w-40">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold mb-3 shadow-lg"
                  style={{
                    backgroundColor: step.color + '20',
                    border: `1px solid ${step.color}40`,
                    boxShadow: `0 0 30px ${step.color}15`,
                  }}
                >
                  <span style={{ color: step.color }}>
                    {i === 0 && (
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                    )}
                    {i === 1 && (
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>
                    )}
                    {i === 2 && (
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                    )}
                    {i === 3 && (
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path d="M4.5 12.75l6 6 9-13.5" /></svg>
                    )}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white">{step.label}</div>
                <div className="text-xs text-[#8888a0] mt-1">{step.sublabel}</div>
              </div>

              {/* Arrow connector */}
              {i < FLOW_STEPS.length - 1 && (
                <div className="hidden md:block mx-2">
                  <svg width="32" height="12" viewBox="0 0 32 12" fill="none">
                    <path d="M0 6H28" stroke="#3d3d55" strokeWidth="1.5" />
                    <path d="M24 1L30 6L24 11" stroke="#3d3d55" strokeWidth="1.5" fill="none" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Key rules */}
        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            'One Supervisor, always. Workers never talk directly.',
            'Verifiers never suggest fixes. PASS or FAIL only.',
            'No patch stacking. FAILED lanes are rewritten from scratch.',
            'Append-only audit trail for every decision.',
            'Parallel lanes execute in isolated git branches.',
            'Merge conflicts resolved by Supervisor reconciliation.',
          ].map((rule) => (
            <div
              key={rule}
              className="flex items-start gap-3 rounded-xl border border-[#1f1f35] bg-[#0c0c18]/50 px-4 py-3"
            >
              <svg className="mt-0.5 shrink-0 text-[#8b5cf6]" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span className="text-xs text-[#a0a0b8] leading-relaxed">{rule}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
