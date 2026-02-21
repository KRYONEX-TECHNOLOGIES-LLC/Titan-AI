'use client';

const STEPS = [
  {
    number: '01',
    title: 'Download & open a project',
    description:
      'Install Titan Desktop, open any folder, and your full project context is loaded instantly — file tree, git history, and dependencies.',
    color: 'from-[#8b5cf6] to-[#7c3aed]',
  },
  {
    number: '02',
    title: 'Select a model & describe your goal',
    description:
      'Pick from 30+ models (Claude, GPT, Gemini, Qwen, DeepSeek) or use Titan Protocol mode for multi-agent governance.',
    color: 'from-[#6d6fff] to-[#4f46e5]',
  },
  {
    number: '03',
    title: 'Agents execute, verify & deliver',
    description:
      'Workers write code, verifiers enforce a 19-item quality checklist, and the supervisor merges only what passes. You review the result.',
    color: 'from-[#3b82f6] to-[#2563eb]',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-24 px-6">
      {/* Subtle divider */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-px bg-gradient-to-r from-transparent via-[#8b5cf6]/20 to-transparent" />

      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-[#3b82f6] tracking-wide uppercase mb-3">How It Works</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Three steps to autonomous engineering.
          </h2>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.number} className="relative">
              {/* Step number */}
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${step.color} text-white text-sm font-bold mb-5`}>
                {step.number}
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">{step.title}</h3>
              <p className="text-sm text-[#8888a0] leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
