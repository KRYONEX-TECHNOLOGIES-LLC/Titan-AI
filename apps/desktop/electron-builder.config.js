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
    '../web/.next/**/*',
    '../web/package.json',
    '../web/next.config.js',
    '../web/node_modules/**/*',
  ],

  extraResources: [
    {
      from: '../web/.next',
      to: 'app/.next',
      filter: ['**/*'],
    },
  ],

  win: {
    icon: 'resources/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
    publisherName: 'KRYONEX TECHNOLOGIES LLC',
    verifyUpdateCodeSignature: false,
    signAndEditExecutable: false,
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'Titan Desktop',
    uninstallDisplayName: 'Titan Desktop',
    displayLanguageSelector: false,
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
      provider: 'generic',
      url: process.env.TITAN_RELEASE_BASE_URL || 'https://download.titan.kryonextech.com',
    },
  ],
};
