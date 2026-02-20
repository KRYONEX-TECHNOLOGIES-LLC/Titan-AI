import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), '..', '..');
const desktopPkg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
);

const version = desktopPkg.version || '0.1.0';
const releaseBase = process.env.TITAN_RELEASE_BASE_URL || 'https://download.titan.kryonextech.com';
const channel = process.env.TITAN_RELEASE_CHANNEL || 'stable';

const manifest = {
  product: 'Titan Desktop',
  channel,
  version,
  publishedAt: new Date().toISOString(),
  downloads: {
    windows: {
      available: true,
      url: `${releaseBase}/windows/Titan-Desktop-${version}-win-x64.exe`,
      checksumUrl: `${releaseBase}/windows/checksums.txt`,
      releaseNotesUrl: '/release-notes',
    },
    macos: {
      available: false,
      url: null,
      checksumUrl: null,
      releaseNotesUrl: '/release-notes',
    },
    linux: {
      available: false,
      url: null,
      checksumUrl: null,
      releaseNotesUrl: '/release-notes',
    },
  },
};

const outPath = path.join(root, 'apps', 'web', 'src', 'app', 'api', 'releases', 'latest', 'manifest.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));

console.log(`Release manifest written: ${outPath}`);
