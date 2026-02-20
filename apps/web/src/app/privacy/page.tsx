export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#06060b] text-[#e6e6ef] px-6 py-14">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold">Titan Desktop Privacy</h1>
        <p className="mt-4 text-sm text-[#a7a7b7]">
          Titan Desktop runs locally and prioritizes local execution. Files, commands, and tool actions
          are executed on your machine unless you explicitly use remote APIs.
        </p>
        <h2 className="mt-8 text-xl font-semibold">Data Handling</h2>
        <p className="mt-2 text-sm text-[#a7a7b7]">
          Model requests may be sent to configured providers (OpenRouter/LiteLLM or BYOK providers)
          according to your configuration. Do not send secrets unless your provider policy allows it.
        </p>
        <h2 className="mt-8 text-xl font-semibold">Local Storage</h2>
        <p className="mt-2 text-sm text-[#a7a7b7]">
          Application settings and session metadata may be stored locally to improve reliability and UX.
          You can clear local state by resetting app storage in your environment.
        </p>
      </div>
    </main>
  );
}
