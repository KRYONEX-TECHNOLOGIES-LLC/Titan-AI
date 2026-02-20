import { NextResponse } from 'next/server';
import manifest from './manifest.json';

export async function GET() {
  const base = process.env.TITAN_RELEASE_BASE_URL || 'https://download.titan.kryonextech.com';
  const version = process.env.TITAN_DESKTOP_VERSION || manifest.version || '0.1.0';

  const payload = {
    ...manifest,
    version,
    downloads: {
      windows: {
        ...manifest.downloads.windows,
        url: process.env.TITAN_WINDOWS_URL || manifest.downloads.windows.url || `${base}/windows/Titan-Desktop-${version}-win-x64.exe`,
        checksumUrl: process.env.TITAN_WINDOWS_CHECKSUM_URL || manifest.downloads.windows.checksumUrl || `${base}/windows/checksums.txt`,
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
