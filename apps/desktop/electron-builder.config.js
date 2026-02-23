/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.kryonex.titan-desktop',
  productName: 'Titan Desktop',
  copyright: 'Copyright © 2026 Kryonex Technologies LLC',
  
  // Let electron-builder handle dependencies. It's better at this now.
  npmRebuild: false, 

  directories: {
    output: 'out',
    buildResources: 'resources',
  },
  artifactName: 'Titan-Desktop-${version}-${os}-${arch}.${ext}',

  // Specify main process and dependencies explicitly
  files: [
    'dist/**/*',
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

  publish: {
    provider: 'github',
    owner: 'KRYONEX-TECHNOLOGIES-LLC',
    repo: 'Titan-AI',
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
};
