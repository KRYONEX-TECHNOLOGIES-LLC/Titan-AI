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
};
