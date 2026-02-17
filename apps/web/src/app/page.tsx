// Home Page
// apps/web/src/app/page.tsx

import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      {/* Hero Section */}
      <div className="text-center max-w-4xl mx-auto">
        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-[var(--titan-primary)] via-[var(--titan-accent)] to-[var(--titan-primary)] bg-clip-text text-transparent">
            Titan AI
          </h1>
          <p className="text-xl text-[var(--titan-foreground-muted)] mt-4">
            The Next-Generation AI-Native IDE
          </p>
        </div>

        {/* Description */}
        <p className="text-lg text-[var(--titan-foreground-muted)] mb-12 max-w-2xl mx-auto">
          Experience coding with an AI companion that truly understands your codebase.
          Multi-agent orchestration, speculative editing, and deep semantic understanding
          powered by frontier AI models.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 justify-center mb-16">
          <Link
            href="/editor"
            className="px-8 py-4 rounded-lg bg-[var(--titan-primary)] text-[var(--titan-primary-foreground)] font-semibold text-lg hover:opacity-90 transition-opacity animate-ai-glow"
          >
            Open Editor
          </Link>
          <a
            href="https://github.com/KRYONEX-TECHNOLOGIES-LLC/Titan-AI"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-4 rounded-lg border-2 border-[var(--titan-border)] text-[var(--titan-foreground)] font-semibold text-lg hover:bg-[var(--titan-background-alt)] transition-colors"
          >
            View on GitHub
          </a>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
          <FeatureCard
            title="Multi-Agent Orchestration"
            description="Specialized AI agents work together - security reviewer, refactor specialist, test writer, and more."
            icon="🤖"
          />
          <FeatureCard
            title="Speculative Editing"
            description="EfficientEdit paradigm with draft model acceleration for blazingly fast code generation."
            icon="⚡"
          />
          <FeatureCard
            title="Semantic Indexing"
            description="Deep understanding of your codebase with Tree-sitter parsing and vector embeddings."
            icon="🔍"
          />
          <FeatureCard
            title="Shadow Workspaces"
            description="Isolated execution environments for safe testing with self-healing capabilities."
            icon="🛡️"
          />
          <FeatureCard
            title="MCP Support"
            description="Full Model Context Protocol integration for connecting to external tools and services."
            icon="🔌"
          />
          <FeatureCard
            title="Zero Telemetry"
            description="Privacy-first design with no data collection. Your code stays yours."
            icon="🔒"
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-24 text-center text-sm text-[var(--titan-foreground-muted)]">
        <p>© 2024 KRYONEX TECHNOLOGIES LLC. All rights reserved.</p>
        <p className="mt-2">
          Built with ❤️ for developers who demand the best.
        </p>
      </footer>
    </main>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="p-6 rounded-lg border border-[var(--titan-border)] bg-[var(--titan-background-alt)] hover:border-[var(--titan-primary)] transition-colors">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-[var(--titan-foreground-muted)]">{description}</p>
    </div>
  );
}
