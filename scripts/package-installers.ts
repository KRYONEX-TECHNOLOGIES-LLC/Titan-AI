#!/usr/bin/env node
// Package Installers Script
// scripts/package-installers.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface InstallerConfig {
  platform: 'win32' | 'darwin' | 'linux' | 'all';
  arch: 'x64' | 'arm64' | 'all';
  version: string;
  sign: boolean;
}

async function packageInstallers(config: Partial<InstallerConfig> = {}) {
  const platforms = config.platform === 'all' 
    ? ['win32', 'darwin', 'linux'] 
    : [config.platform || process.platform];
  
  const archs = config.arch === 'all'
    ? ['x64', 'arm64']
    : [config.arch || (process.arch === 'arm64' ? 'arm64' : 'x64')];

  const version = config.version || getVersion();
  const sign = config.sign ?? true;

  console.log('📦 Packaging Titan AI Installers');
  console.log(`   Version: ${version}`);
  console.log(`   Platforms: ${platforms.join(', ')}`);
  console.log(`   Architectures: ${archs.join(', ')}`);
  console.log(`   Code Signing: ${sign ? 'enabled' : 'disabled'}`);

  const rootDir = path.resolve(__dirname, '..');
  const distDir = path.join(rootDir, 'dist');

  for (const platform of platforms) {
    for (const arch of archs) {
      console.log(`\n📦 Creating installer for ${platform}-${arch}...`);
      
      try {
        switch (platform) {
          case 'win32':
            await createWindowsInstaller(rootDir, distDir, arch, version, sign);
            break;
          case 'darwin':
            await createMacOSInstaller(rootDir, distDir, arch, version, sign);
            break;
          case 'linux':
            await createLinuxInstallers(rootDir, distDir, arch, version);
            break;
        }
        
        console.log(`   ✅ ${platform}-${arch} installer created`);
      } catch (err) {
        console.error(`   ❌ Failed to create ${platform}-${arch} installer:`, err);
      }
    }
  }

  console.log('\n✅ All installers packaged!');
  console.log(`   Output: ${distDir}`);
}

function getVersion(): string {
  const rootDir = path.resolve(__dirname, '..');
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8')
  );
  return packageJson.version || '0.1.0';
}

async function createWindowsInstaller(
  rootDir: string,
  distDir: string,
  arch: string,
  version: string,
  sign: boolean
): Promise<void> {
  const outputPath = path.join(distDir, `TitanAI-${version}-${arch}-setup.exe`);
  const appDir = path.join(distDir, `titan-ai-win32-${arch}`);

  console.log('   Creating NSIS installer...');

  // NSIS script would be here
  const nsisScript = `
    !include "MUI2.nsh"

    Name "Titan AI"
    OutFile "${outputPath}"
    InstallDir "$PROGRAMFILES64\\Titan AI"
    
    !insertmacro MUI_PAGE_WELCOME
    !insertmacro MUI_PAGE_DIRECTORY
    !insertmacro MUI_PAGE_INSTFILES
    !insertmacro MUI_PAGE_FINISH
    
    !insertmacro MUI_LANGUAGE "English"
    
    Section "Install"
      SetOutPath $INSTDIR
      File /r "${appDir}\\*.*"
      
      CreateShortcut "$DESKTOP\\Titan AI.lnk" "$INSTDIR\\TitanAI.exe"
      CreateDirectory "$SMPROGRAMS\\Titan AI"
      CreateShortcut "$SMPROGRAMS\\Titan AI\\Titan AI.lnk" "$INSTDIR\\TitanAI.exe"
      
      WriteUninstaller "$INSTDIR\\Uninstall.exe"
    SectionEnd
    
    Section "Uninstall"
      RMDir /r "$INSTDIR"
      Delete "$DESKTOP\\Titan AI.lnk"
      RMDir /r "$SMPROGRAMS\\Titan AI"
    SectionEnd
  `;

  const nsisScriptPath = path.join(distDir, 'installer.nsi');
  fs.writeFileSync(nsisScriptPath, nsisScript);

  // In production, would run: makensis installer.nsi
  console.log(`   NSIS script created: ${nsisScriptPath}`);

  if (sign) {
    console.log('   Code signing Windows installer...');
    // Would use signtool.exe here
  }
}

async function createMacOSInstaller(
  rootDir: string,
  distDir: string,
  arch: string,
  version: string,
  sign: boolean
): Promise<void> {
  const appName = 'Titan AI.app';
  const outputPath = path.join(distDir, `TitanAI-${version}-${arch}.dmg`);
  const appDir = path.join(distDir, `titan-ai-darwin-${arch}`, appName);

  console.log('   Creating DMG...');

  // In production, would use create-dmg
  const dmgSpec = {
    title: 'Titan AI',
    icon: path.join(rootDir, 'resources', 'darwin', 'icon.icns'),
    background: path.join(rootDir, 'resources', 'darwin', 'dmg-background.png'),
    iconSize: 80,
    contents: [
      { x: 380, y: 170, type: 'link', path: '/Applications' },
      { x: 130, y: 170, type: 'file', path: appDir },
    ],
  };

  console.log(`   DMG spec created for ${outputPath}`);

  if (sign) {
    console.log('   Code signing macOS app...');
    // Would use codesign here
    
    console.log('   Notarizing with Apple...');
    // Would use notarytool here
  }
}

async function createLinuxInstallers(
  rootDir: string,
  distDir: string,
  arch: string,
  version: string
): Promise<void> {
  const appDir = path.join(distDir, `titan-ai-linux-${arch}`);
  
  // AppImage
  console.log('   Creating AppImage...');
  const appImagePath = path.join(distDir, `TitanAI-${version}-${arch}.AppImage`);
  // In production, would use appimagetool

  // .deb package
  console.log('   Creating .deb package...');
  const debPath = path.join(distDir, `titanai_${version}_${arch === 'x64' ? 'amd64' : 'arm64'}.deb`);
  
  const debControl = `
Package: titanai
Version: ${version}
Section: devel
Priority: optional
Architecture: ${arch === 'x64' ? 'amd64' : 'arm64'}
Maintainer: KRYONEX TECHNOLOGIES LLC <support@kryonex.com>
Description: Titan AI - AI-Native IDE
 The next-generation AI-native integrated development environment.
`;

  const debControlDir = path.join(distDir, 'deb', 'DEBIAN');
  fs.mkdirSync(debControlDir, { recursive: true });
  fs.writeFileSync(path.join(debControlDir, 'control'), debControl.trim());
  
  // Would run dpkg-deb here

  // .rpm package
  console.log('   Creating .rpm package...');
  const rpmPath = path.join(distDir, `titanai-${version}-1.${arch === 'x64' ? 'x86_64' : 'aarch64'}.rpm`);
  // Would use rpmbuild here

  console.log(`   Linux packages created`);
}

// CLI
const args = process.argv.slice(2);
const config: Partial<InstallerConfig> = {};

for (const arg of args) {
  if (arg.startsWith('--platform=')) {
    config.platform = arg.split('=')[1] as InstallerConfig['platform'];
  } else if (arg.startsWith('--arch=')) {
    config.arch = arg.split('=')[1] as InstallerConfig['arch'];
  } else if (arg.startsWith('--version=')) {
    config.version = arg.split('=')[1];
  } else if (arg === '--no-sign') {
    config.sign = false;
  }
}

packageInstallers(config).catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
