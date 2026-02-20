// Root Layout
// apps/web/src/app/layout.tsx

import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import TitanSessionProvider from '@/providers/session-provider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'Titan AI - AI-Native IDE',
  description: 'The next-generation AI-native integrated development environment',
  keywords: ['IDE', 'AI', 'coding', 'development', 'Titan AI'],
  authors: [{ name: 'KRYONEX TECHNOLOGIES LLC' }],
  creator: 'KRYONEX TECHNOLOGIES LLC',
  publisher: 'KRYONEX TECHNOLOGIES LLC',
  robots: 'index, follow',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a14' },
  ],
};

export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hydrationGuardScript = `
    (function () {
      try {
        var shouldRemove = function (el) {
          if (!(el instanceof HTMLElement)) return false;
          if (el.classList.contains('supplier-app-container')) return true;
          if (!el.classList.contains('react-draggable')) return false;
          var style = el.style || {};
          return style.display === 'none' && (style.zIndex === '999999' || style.position === 'fixed');
        };

        var clean = function (root) {
          if (!root) return;
          if (shouldRemove(root)) {
            root.remove();
            return;
          }
          if (root.querySelectorAll) {
            var matches = root.querySelectorAll('.supplier-app-container, .react-draggable');
            for (var i = 0; i < matches.length; i++) {
              if (shouldRemove(matches[i])) {
                matches[i].remove();
              }
            }
          }
        };

        clean(document.body);
        var observer = new MutationObserver(function (mutations) {
          for (var i = 0; i < mutations.length; i++) {
            var mutation = mutations[i];
            for (var j = 0; j < mutation.addedNodes.length; j++) {
              clean(mutation.addedNodes[j]);
            }
          }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(function () {
          observer.disconnect();
        }, 8000);
      } catch (_e) {
        // Guard intentionally silent; hydration must continue even if this fails.
      }
    })();
  `;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body suppressHydrationWarning className="font-sans antialiased">
        <script
          id="titan-hydration-guard"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: hydrationGuardScript }}
        />
        <div id="titan-root" suppressHydrationWarning>
          <TitanSessionProvider>
            {children}
          </TitanSessionProvider>
        </div>
      </body>
    </html>
  );
}
