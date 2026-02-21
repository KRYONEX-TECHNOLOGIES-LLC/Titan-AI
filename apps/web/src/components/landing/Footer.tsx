import Link from 'next/link';

const NAV_GROUPS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Download', href: '#download' },
      { label: 'Release Notes', href: '/release-notes' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'KRYONEX TECHNOLOGIES', href: '#' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-[#1f1f35] bg-[#06060b]">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#3b82f6]" />
              <span className="text-sm font-semibold text-white">Titan AI</span>
            </div>
            <p className="text-xs text-[#5f5f75] leading-relaxed max-w-[220px]">
              The AI engineering desktop built for teams that ship production code.
            </p>
          </div>

          {/* Nav groups */}
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#5f5f75] mb-4">
                {group.title}
              </h4>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-[#8888a0] hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-14 pt-6 border-t border-[#1f1f35] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#5f5f75]">
            &copy; {new Date().getFullYear()} KRYONEX TECHNOLOGIES LLC. All rights reserved.
          </p>
          <p className="text-xs text-[#3d3d55]">
            Built with precision. Shipped with governance.
          </p>
        </div>
      </div>
    </footer>
  );
}
