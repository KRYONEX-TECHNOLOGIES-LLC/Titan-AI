export default function ReleaseNotesPage() {
  return (
    <main className="min-h-screen bg-[#06060b] text-[#e6e6ef] px-6 py-14">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold">Titan Desktop Release Notes</h1>
        <div className="mt-8 rounded-xl border border-[#25253d] bg-[#10101a] p-6">
          <h2 className="text-xl font-semibold">v0.1.0</h2>
          <p className="mt-2 text-sm text-[#a7a7b7]">Desktop-only launch baseline.</p>
          <ul className="mt-4 list-disc pl-5 text-sm text-[#b8b8ca] space-y-1">
            <li>Desktop app becomes canonical runtime and loads the `/editor` product route.</li>
            <li>Web root replaced with landing + download funnel.</li>
            <li>Release metadata endpoint added for versioned installer links.</li>
            <li>Titan Governance Protocol v2 integrated as platform quality mode.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
