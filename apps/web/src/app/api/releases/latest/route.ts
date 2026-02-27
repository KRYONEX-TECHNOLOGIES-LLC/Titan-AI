import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import manifest from './manifest.json';

function getPackageVersion(): string {
  try {
    const raw = readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8');
    return (JSON.parse(raw) as { version?: string }).version || '';
  } catch { return ''; }
}

export async function GET() {
  const owner = 'KRYONEX-TECHNOLOGIES-LLC';
  const repo = 'Titan-AI';
  const version = process.env.TITAN_DESKTOP_VERSION || getPackageVersion() || manifest.version || '0.1.0';
  const base =
    process.env.TITAN_RELEASE_BASE_URL ||
    `https://github.com/${owner}/${repo}/releases/download/v${version}`;

  const payload = {
    ...manifest,
    version,
    downloads: {
      windows: {
        ...manifest.downloads.windows,
        url:
          process.env.TITAN_WINDOWS_URL ||
          manifest.downloads.windows.url ||
          `${base}/Titan-Desktop-${version}-win-x64.exe`,
        checksumUrl:
          process.env.TITAN_WINDOWS_CHECKSUM_URL ||
          manifest.downloads.windows.checksumUrl ||
          `${base}/latest.yml`,
        releaseNotesUrl: process.env.TITAN_RELEASE_NOTES_URL || manifest.downloads.windows.releaseNotesUrl || '/release-notes',
      },
      macos: {
        ...manifest.downloads.macos,
        url: process.env.TITAN_MACOS_URL || manifest.downloads.macos.url,
        checksumUrl: process.env.TITAN_MACOS_CHECKSUM_URL || manifest.downloads.macos.checksumUrl,
        releaseNotesUrl: process.env.TITAN_RELEASE_NOTES_URL || manifest.downloads.macos.releaseNotesUrl || '/release-notes',
      },
      linux: {
        ...manifest.downloads.linux,
        url: process.env.TITAN_LINUX_URL || manifest.downloads.linux.url,
        checksumUrl: process.env.TITAN_LINUX_CHECKSUM_URL || manifest.downloads.linux.checksumUrl,
        releaseNotesUrl: process.env.TITAN_RELEASE_NOTES_URL || manifest.downloads.linux.releaseNotesUrl || '/release-notes',
      },
    },
  };

  return NextResponse.json(payload);
}
