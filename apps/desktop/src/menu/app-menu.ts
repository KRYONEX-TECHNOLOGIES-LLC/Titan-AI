import { Menu, BrowserWindow, app, shell } from 'electron';

export function createAppMenu(win: BrowserWindow): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ] as Electron.MenuItemConstructorOptions[],
    }] : []),

    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => win.webContents.send('menu:newFile'),
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => win.webContents.send('menu:openFolder'),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => win.webContents.send('menu:save'),
        },
        {
          label: 'Save All',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => win.webContents.send('menu:saveAll'),
        },
        { type: 'separator' },
        ...(isMac ? [] : [{ role: 'quit' as const }]),
      ] as Electron.MenuItemConstructorOptions[],
    },

    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find in Files',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => win.webContents.send('menu:findInFiles'),
        },
      ] as Electron.MenuItemConstructorOptions[],
    },

    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => win.webContents.send('menu:toggleSidebar'),
        },
        {
          label: 'Toggle Terminal',
          accelerator: 'CmdOrCtrl+`',
          click: () => win.webContents.send('menu:toggleTerminal'),
        },
        {
          label: 'Toggle Agent Panel',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => win.webContents.send('menu:toggleAgent'),
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ] as Electron.MenuItemConstructorOptions[],
    },

    {
      label: 'Terminal',
      submenu: [
        {
          label: 'New Terminal',
          accelerator: 'CmdOrCtrl+Shift+`',
          click: () => win.webContents.send('menu:newTerminal'),
        },
        {
          label: 'Clear Terminal',
          click: () => win.webContents.send('menu:clearTerminal'),
        },
      ],
    },

    {
      label: 'Help',
      submenu: [
        {
          label: 'About Titan AI',
          click: () => win.webContents.send('menu:about'),
        },
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://titan-ai.dev/docs'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Cmd+Option+I' : 'F12',
          click: () => win.webContents.toggleDevTools(),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
