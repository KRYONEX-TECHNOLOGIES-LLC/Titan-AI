/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.kryonex.titan-ai',
  productName: 'Titan AI',
  copyright: 'Copyright © 2026 Kryonex Technologies LLC',

  directories: {
    output: 'out',
    buildResources: 'resources',
  },

  files: [
    'dist/**/*',
    'node_modules/**/*',
    '../web/.next/**/*',
    '../web/public/**/*',
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
    {
      from: '../web/public',
      to: 'app/public',
      filter: ['**/*'],
    },
  ],

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'resources/icon.ico',
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'resources/icon.ico',
    uninstallerIcon: 'resources/icon.ico',
    installerHeaderIcon: 'resources/icon.ico',
  },

  mac: {
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    icon: 'resources/icon.icns',
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
    target: [{ target: 'AppImage', arch: ['x64'] }, { target: 'deb', arch: ['x64'] }],
    icon: 'resources/icon.png',
    category: 'Development',
    maintainer: 'Kryonex Technologies LLC',
  },

  protocols: [
    {
      name: 'Titan AI',
      schemes: ['titan-ai'],
    },
  ],

  publish: null,
};
