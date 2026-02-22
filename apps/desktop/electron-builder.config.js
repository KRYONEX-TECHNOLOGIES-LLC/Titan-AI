const fs = require('fs');
const nodePath = require('path');

/**
 * Flatten a pnpm node_modules directory into a standard hoisted layout.
 * pnpm stores real packages in .pnpm/<name>@<ver>/node_modules/<dep> and
 * uses symlinks everywhere else. NSIS installers break those symlinks.
 * This function hoists every package to the top-level node_modules/ and
 * removes the .pnpm store, producing a flat npm-style structure.
 */
function flattenPnpmNodeModules(nodeModulesDir) {
  const pnpmDir = nodePath.join(nodeModulesDir, '.pnpm');

  if (fs.existsSync(pnpmDir)) {
    const storeEntries = fs.readdirSync(pnpmDir);
    for (const storeEntry of storeEntries) {
      if (storeEntry === 'node_modules' || storeEntry === 'lock.yaml') continue;
      const innerNM = nodePath.join(pnpmDir, storeEntry, 'node_modules');
      if (!fs.existsSync(innerNM)) continue;
      let innerPkgs;
      try { innerPkgs = fs.readdirSync(innerNM); } catch { continue; }

      for (const pkg of innerPkgs) {
        if (pkg === '.pnpm' || pkg.startsWith('.')) continue;
        const src = nodePath.join(innerNM, pkg);

        if (pkg.startsWith('@')) {
          let scopedPkgs;
          try { scopedPkgs = fs.readdirSync(src); } catch { continue; }
          for (const sp of scopedPkgs) {
            const scopedDest = nodePath.join(nodeModulesDir, pkg, sp);
            if (fs.existsSync(scopedDest)) continue;
            try {
              const realSrc = fs.realpathSync(nodePath.join(src, sp));
              fs.mkdirSync(nodePath.join(nodeModulesDir, pkg), { recursive: true });
              fs.cpSync(realSrc, scopedDest, { recursive: true });
            } catch (err) {
              console.warn(`[flatten] skip @scoped ${pkg}/${sp}: ${err.message}`);
            }
          }
        } else {
          const dest = nodePath.join(nodeModulesDir, pkg);
          if (fs.existsSync(dest) && !fs.lstatSync(dest).isSymbolicLink()) continue;
          try {
            const realSrc = fs.realpathSync(src);
            if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
            fs.cpSync(realSrc, dest, { recursive: true });
          } catch (err) {
            console.warn(`[flatten] skip ${pkg}: ${err.message}`);
          }
        }
      }
    }
    fs.rmSync(pnpmDir, { recursive: true, force: true });
  }

  // Replace ALL symlinks with real copies (runs even without .pnpm store)
  for (const entry of fs.readdirSync(nodeModulesDir)) {
    if (entry === '.pnpm') continue;
    const fullPath = nodePath.join(nodeModulesDir, entry);
    try {
      if (fs.lstatSync(fullPath).isSymbolicLink()) {
        const real = fs.realpathSync(fullPath);
        fs.rmSync(fullPath, { recursive: true, force: true });
        fs.cpSync(real, fullPath, { recursive: true });
      }
    } catch {}
  }
}

function findAllNodeModules(dir) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (entry.name === '.pnpm') continue;
    const full = nodePath.join(dir, entry.name);
    if (entry.name === 'node_modules') {
      results.push(full);
    }
    try {
      if (fs.lstatSync(full).isDirectory() && !fs.lstatSync(full).isSymbolicLink()) {
        results.push(...findAllNodeModules(full));
      }
    } catch {}
  }
  return results;
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.kryonex.titan-desktop',
  productName: 'Titan Desktop',
  copyright: 'Copyright © 2026 Kryonex Technologies LLC',
  npmRebuild: false,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,

  directories: {
    output: 'out',
    buildResources: 'resources',
  },
  artifactName: 'Titan-Desktop-${version}-${os}-${arch}.${ext}',

  files: [
    'dist/**/*',
    'node_modules/**/*',
  ],

  extraResources: [
    {
      from: '../web/.next/standalone',
      to: 'web-server',
      filter: ['**/*'],
    },
    {
      from: '../web/.next/static',
      to: 'web-server/apps/web/.next/static',
      filter: ['**/*'],
    },
    {
      from: '../web/public',
      to: 'web-server/apps/web/public',
      filter: ['**/*'],
    },
    // Make icon.ico available at runtime for BrowserWindow taskbar icon
    {
      from: 'resources/icon.ico',
      to: 'icon.ico',
    },
  ],

  win: {
    icon: 'resources/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
    publisherName: 'KRYONEX TECHNOLOGIES LLC',
    verifyUpdateCodeSignature: false,
    // signAndEditExecutable must NOT be false — electron-builder needs to rewrite the
    // exe's resource table to embed the Titan icon, product name, and company metadata.
    // Leaving it false means the exe ships as stock "Electron" with the default icon.
  },

  nsis: {
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'Titan Desktop',
    uninstallDisplayName: 'Titan Desktop',
    displayLanguageSelector: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    installerIcon: 'resources/icon.ico',
    uninstallerIcon: 'resources/icon.ico',
    runAfterFinish: true,
  },

  mac: {
    icon: 'resources/icon.png',
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
  },

  dmg: {
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },

  linux: {
    icon: 'resources/icon.png',
    target: [{ target: 'AppImage', arch: ['x64'] }, { target: 'deb', arch: ['x64'] }],
    category: 'Development',
    maintainer: 'Kryonex Technologies LLC',
  },

  protocols: [
    {
      name: 'Titan Desktop',
      schemes: ['titan-desktop', 'titan-ai'],
    },
  ],

  publish: [
    {
      provider: 'github',
      owner: process.env.TITAN_GITHUB_OWNER || 'KRYONEX-TECHNOLOGIES-LLC',
      repo: process.env.TITAN_GITHUB_REPO || 'Titan-AI',
      releaseType: 'release',
    },
  ],

  afterPack: async (context) => {
    const webServer = nodePath.join(context.appOutDir, 'resources', 'web-server');
    if (!fs.existsSync(webServer)) return;

    console.log('[afterPack] Flattening pnpm node_modules into standard layout...');
    const nmDirs = findAllNodeModules(webServer);
    for (const nmDir of nmDirs) {
      flattenPnpmNodeModules(nmDir);
    }
    console.log(`[afterPack] Flattened ${nmDirs.length} node_modules directories.`);
  },
};

