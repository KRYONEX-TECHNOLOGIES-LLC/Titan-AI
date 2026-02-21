'use client';

export function IDEMockup() {
  return (
    <section className="relative py-16 px-6">
      <div className="mx-auto max-w-6xl">
        {/* Window chrome */}
        <div className="landing-fade-in rounded-2xl border border-[#1f1f35] bg-[#0c0c18] shadow-[0_20px_80px_rgba(139,92,246,0.08),0_0_0_1px_rgba(255,255,255,0.03)] overflow-hidden">
          {/* Title bar */}
          <div className="flex items-center h-10 px-4 bg-[#111120] border-b border-[#1a1a30]">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex-1 text-center text-xs text-[#5a5a78]">
              Titan Desktop &mdash; ~/projects/my-app
            </div>
          </div>

          {/* IDE body */}
          <div className="flex h-[420px] sm:h-[480px] lg:h-[540px]">
            {/* Activity bar */}
            <div className="w-12 flex flex-col items-center py-3 gap-3 bg-[#0a0a16] border-r border-[#1a1a30]">
              <div className="w-6 h-6 rounded bg-[#8b5cf6]/20 flex items-center justify-center">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#8b5cf6" strokeWidth="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
              </div>
              <div className="w-6 h-6 rounded flex items-center justify-center">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#5a5a78" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              </div>
              <div className="w-6 h-6 rounded flex items-center justify-center">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#5a5a78" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94"/></svg>
              </div>
              <div className="flex-1" />
              <div className="w-6 h-6 rounded flex items-center justify-center">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#5a5a78" strokeWidth="2"><path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/></svg>
              </div>
            </div>

            {/* File explorer */}
            <div className="w-48 hidden sm:flex flex-col bg-[#0d0d1a] border-r border-[#1a1a30]">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#5a5a78]">Explorer</div>
              <div className="flex-1 px-2 text-xs text-[#8888a0] space-y-0.5">
                <div className="px-2 py-1 rounded text-[#c4b5fd] bg-[#8b5cf6]/10">src/</div>
                <div className="px-2 py-1 pl-5 rounded hover:bg-white/[0.02]">app.tsx</div>
                <div className="px-2 py-1 pl-5 rounded hover:bg-white/[0.02]">index.ts</div>
                <div className="px-2 py-1 pl-5 rounded hover:bg-white/[0.02]">utils.ts</div>
                <div className="px-2 py-1 rounded hover:bg-white/[0.02]">package.json</div>
                <div className="px-2 py-1 rounded hover:bg-white/[0.02]">tsconfig.json</div>
              </div>
            </div>

            {/* Editor area */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Tabs */}
              <div className="flex items-center h-9 bg-[#0d0d1a] border-b border-[#1a1a30]">
                <div className="flex items-center gap-2 px-4 h-full border-r border-[#1a1a30] text-xs text-[#c4b5fd] bg-[#0c0c18]">
                  <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                  app.tsx
                </div>
                <div className="flex items-center gap-2 px-4 h-full text-xs text-[#5a5a78]">
                  index.ts
                </div>
              </div>

              {/* Code */}
              <div className="flex-1 p-4 font-mono text-[12px] leading-6 text-[#9898b0] overflow-hidden">
                <div><span className="text-[#c678dd]">import</span> <span className="text-[#e5c07b]">{'{ Agent }'}</span> <span className="text-[#c678dd]">from</span> <span className="text-[#98c379]">&apos;@titan/core&apos;</span></div>
                <div><span className="text-[#c678dd]">import</span> <span className="text-[#e5c07b]">{'{ Supervisor }'}</span> <span className="text-[#c678dd]">from</span> <span className="text-[#98c379]">&apos;@titan/protocol&apos;</span></div>
                <div className="text-[#5c6370]">&nbsp;</div>
                <div><span className="text-[#c678dd]">const</span> <span className="text-[#61afef]">supervisor</span> = <span className="text-[#c678dd]">new</span> <span className="text-[#e5c07b]">Supervisor</span>({'{'}</div>
                <div>&nbsp;&nbsp;<span className="text-[#e06c75]">model</span>: <span className="text-[#98c379]">&apos;claude-opus-4.6&apos;</span>,</div>
                <div>&nbsp;&nbsp;<span className="text-[#e06c75]">workers</span>: <span className="text-[#d19a66]">4</span>,</div>
                <div>&nbsp;&nbsp;<span className="text-[#e06c75]">verifiers</span>: <span className="text-[#d19a66]">2</span>,</div>
                <div>&nbsp;&nbsp;<span className="text-[#e06c75]">governance</span>: <span className="text-[#d19a66]">true</span>,</div>
                <div>{'})'}</div>
                <div className="text-[#5c6370]">&nbsp;</div>
                <div><span className="text-[#c678dd]">await</span> <span className="text-[#61afef]">supervisor</span>.<span className="text-[#61afef]">execute</span>(<span className="text-[#98c379]">&apos;Build the auth module&apos;</span>)</div>
                <div className="text-[#5c6370]">// Supervisor decomposes → Workers execute → Verifiers check → Merge</div>
              </div>
            </div>

            {/* Chat panel */}
            <div className="w-72 hidden lg:flex flex-col bg-[#0d0d1a] border-l border-[#1a1a30]">
              <div className="px-4 py-3 border-b border-[#1a1a30] text-xs font-medium text-[#a0a0b8]">
                Titan Agent
              </div>
              <div className="flex-1 p-3 space-y-3 text-xs overflow-hidden">
                <div className="p-2.5 rounded-lg bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 text-[#c4b5fd]">
                  <div className="font-medium text-[#8b5cf6] mb-1">Supervisor</div>
                  Decomposing into 3 parallel lanes...
                </div>
                <div className="p-2.5 rounded-lg bg-[#0a0a16] border border-[#1a1a30] text-[#8888a0]">
                  <div className="font-medium text-[#3b82f6] mb-1">Worker Lane 1</div>
                  Building authentication endpoints...
                </div>
                <div className="p-2.5 rounded-lg bg-[#0a0a16] border border-[#1a1a30] text-[#8888a0]">
                  <div className="font-medium text-[#3b82f6] mb-1">Worker Lane 2</div>
                  Creating database schema...
                </div>
                <div className="p-2.5 rounded-lg bg-[#10b981]/10 border border-[#10b981]/20 text-[#6ee7b7]">
                  <div className="font-medium text-[#10b981] mb-1">Verifier</div>
                  Lane 1 PASS &mdash; 19/19 checks cleared
                </div>
              </div>
              {/* Input */}
              <div className="p-3 border-t border-[#1a1a30]">
                <div className="flex items-center rounded-lg bg-[#0a0a16] border border-[#1a1a30] px-3 py-2 text-xs text-[#5a5a78]">
                  Ask Titan anything...
                </div>
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between h-6 px-4 bg-[#8b5cf6] text-[10px] text-white/90">
            <div className="flex items-center gap-4">
              <span>main</span>
              <span>0 errors</span>
            </div>
            <div className="flex items-center gap-4">
              <span>TypeScript</span>
              <span>UTF-8</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                Titan Protocol v2
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
