// Editor Loading Component
// apps/web/src/components/editor-loading.tsx

export function EditorLoading() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[var(--titan-background)]">
      <div className="text-center">
        {/* Animated Logo */}
        <div className="relative mb-8">
          <div className="text-4xl font-bold bg-gradient-to-r from-[var(--titan-primary)] via-[var(--titan-accent)] to-[var(--titan-primary)] bg-clip-text text-transparent animate-pulse">
            Titan AI
          </div>
          <div className="absolute -inset-4 rounded-lg opacity-30 animate-ai-glow" />
        </div>

        {/* Loading indicator */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-[var(--titan-primary)] animate-bounce [animation-delay:-0.3s]" />
          <div className="w-2 h-2 rounded-full bg-[var(--titan-primary)] animate-bounce [animation-delay:-0.15s]" />
          <div className="w-2 h-2 rounded-full bg-[var(--titan-primary)] animate-bounce" />
        </div>

        <p className="text-sm text-[var(--titan-foreground-muted)]">
          Initializing AI workspace...
        </p>

        {/* Progress steps */}
        <div className="mt-8 space-y-2 text-xs text-[var(--titan-foreground-muted)]">
          <LoadingStep text="Loading Monaco Editor" delay={0} />
          <LoadingStep text="Initializing AI Gateway" delay={200} />
          <LoadingStep text="Setting up WebContainer" delay={400} />
          <LoadingStep text="Connecting to MCP servers" delay={600} />
        </div>
      </div>
    </div>
  );
}

function LoadingStep({ text, delay }: { text: string; delay: number }) {
  return (
    <div
      className="flex items-center gap-2 animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <svg
        className="w-3 h-3 animate-spin text-[var(--titan-ai-accent)]"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 1a5 5 0 0 1 5 5" />
      </svg>
      <span>{text}</span>
    </div>
  );
}
