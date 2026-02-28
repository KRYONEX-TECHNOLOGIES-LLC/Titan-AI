const fs = require('fs');
const nodePath = require('path');

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
    '!node_modules/**/*.map',
    '!node_modules/**/*.d.ts',
    '!node_modules/**/*.d.mts',
    '!node_modules/**/*.d.cts',
    '!node_modules/**/*.md',
    '!node_modules/**/README*',
    '!node_modules/**/CHANGELOG*',
    '!node_modules/**/HISTORY*',
    '!node_modules/**/LICENSE*',
    '!node_modules/**/__tests__/**',
    '!node_modules/**/test/**',
    '!node_modules/**/tests/**',
    '!node_modules/**/docs/**',
    '!node_modules/**/.tsbuildinfo',
  ],

  extraResources: [
    {
      from: '../web/.next/web-server-standalone.tar',
      to: 'web-server-standalone.tar',
    },
    {
      from: '../web/.next/static',
      to: 'web-server/apps/web/.next/static',
      filter: ['**/*', '!**/*.map'],
    },
    {
      from: '../web/public',
      to: 'web-server/apps/web/public',
      filter: ['**/*'],
    },
    {
      from: '../web/.env',
      to: 'web-server/apps/web/.env',
    },
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
    customNsisBinary: {
      url: 'https://github.com/AstraliteHeart/NSISBI-ElectronBuilder/releases/download/v1.0.1/nsisbi-electronbuilder-3.10.3.7z',
      checksum: 'WRmZUsACjIc2s7bvsFGFRofK31hfS7riPlcfI1V9uFB2Q8s7tidgI/9U16+X0I9X2ZhNxi8N7Z3gKvm6ojvLvg==',
    },
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
