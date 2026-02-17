#!/usr/bin/env node
// Code Signing Script
// scripts/code-sign.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface SignConfig {
  platform: 'win32' | 'darwin';
  input: string;
  certificatePath?: string;
  certificatePassword?: string;
  appleId?: string;
  appleTeamId?: string;
}

async function signCode(config: SignConfig) {
  console.log('🔐 Code Signing');
  console.log(`   Platform: ${config.platform}`);
  console.log(`   Input: ${config.input}`);

  if (!fs.existsSync(config.input)) {
    throw new Error(`Input file not found: ${config.input}`);
  }

  switch (config.platform) {
    case 'win32':
      await signWindows(config);
      break;
    case 'darwin':
      await signMacOS(config);
      break;
    default:
      console.log('   Code signing not required for this platform');
  }

  console.log('\n✅ Code signing complete!');
}

async function signWindows(config: SignConfig): Promise<void> {
  console.log('   Using Windows Code Signing...');

  const certificatePath = config.certificatePath || process.env.WINDOWS_CERTIFICATE_PATH;
  const certificatePassword = config.certificatePassword || process.env.WINDOWS_CERTIFICATE_PASSWORD;

  if (!certificatePath) {
    console.log('   Warning: No certificate provided, skipping signing');
    return;
  }

  // Find signtool
  const signtoolPaths = [
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64\\signtool.exe',
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.19041.0\\x64\\signtool.exe',
    'signtool.exe',
  ];

  let signtool: string | null = null;
  for (const p of signtoolPaths) {
    try {
      execSync(`"${p}" /?`, { stdio: 'ignore' });
      signtool = p;
      break;
    } catch {
      continue;
    }
  }

  if (!signtool) {
    throw new Error('signtool.exe not found. Please install Windows SDK.');
  }

  const command = [
    `"${signtool}"`,
    'sign',
    '/f', `"${certificatePath}"`,
    certificatePassword ? `/p "${certificatePassword}"` : '',
    '/tr', 'http://timestamp.digicert.com',
    '/td', 'sha256',
    '/fd', 'sha256',
    '/d', '"Titan AI"',
    `"${config.input}"`,
  ].filter(Boolean).join(' ');

  console.log('   Signing executable...');
  execSync(command, { stdio: 'inherit' });
}

async function signMacOS(config: SignConfig): Promise<void> {
  console.log('   Using Apple Code Signing...');

  const appleId = config.appleId || process.env.APPLE_ID;
  const teamId = config.appleTeamId || process.env.APPLE_TEAM_ID;
  const identity = process.env.APPLE_IDENTITY || 'Developer ID Application';

  // Sign the app
  console.log('   Signing application...');
  
  const signCommand = [
    'codesign',
    '--deep',
    '--force',
    '--verify',
    '--verbose',
    '--timestamp',
    '--options', 'runtime',
    '--sign', `"${identity}"`,
    `"${config.input}"`,
  ].join(' ');

  execSync(signCommand, { stdio: 'inherit' });

  // Verify signature
  console.log('   Verifying signature...');
  execSync(`codesign --verify --deep --strict "${config.input}"`, { stdio: 'inherit' });

  // Notarize
  if (appleId && teamId) {
    console.log('   Notarizing with Apple...');
    
    // Create ZIP for notarization
    const zipPath = `${config.input}.zip`;
    execSync(`ditto -c -k --keepParent "${config.input}" "${zipPath}"`, { stdio: 'inherit' });

    // Submit for notarization
    const notarizeCommand = [
      'xcrun', 'notarytool', 'submit',
      `"${zipPath}"`,
      '--apple-id', appleId,
      '--team-id', teamId,
      '--wait',
    ].join(' ');

    try {
      execSync(notarizeCommand, { stdio: 'inherit' });
      
      // Staple the notarization
      console.log('   Stapling notarization ticket...');
      execSync(`xcrun stapler staple "${config.input}"`, { stdio: 'inherit' });
    } finally {
      // Clean up ZIP
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    }
  } else {
    console.log('   Warning: Apple ID/Team ID not provided, skipping notarization');
  }
}

// CLI
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage: npx ts-node scripts/code-sign.ts <platform> <input>');
  console.log('  platform: win32 | darwin');
  console.log('  input: path to file or app bundle to sign');
  console.log('');
  console.log('Environment variables:');
  console.log('  Windows:');
  console.log('    WINDOWS_CERTIFICATE_PATH - Path to .pfx certificate');
  console.log('    WINDOWS_CERTIFICATE_PASSWORD - Certificate password');
  console.log('  macOS:');
  console.log('    APPLE_ID - Apple ID for notarization');
  console.log('    APPLE_TEAM_ID - Apple Team ID');
  console.log('    APPLE_IDENTITY - Code signing identity (default: "Developer ID Application")');
  process.exit(1);
}

const config: SignConfig = {
  platform: args[0] as SignConfig['platform'],
  input: args[1],
};

// Parse additional args
for (let i = 2; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--certificate=')) {
    config.certificatePath = arg.split('=')[1];
  } else if (arg.startsWith('--password=')) {
    config.certificatePassword = arg.split('=')[1];
  } else if (arg.startsWith('--apple-id=')) {
    config.appleId = arg.split('=')[1];
  } else if (arg.startsWith('--team-id=')) {
    config.appleTeamId = arg.split('=')[1];
  }
}

signCode(config).catch((err) => {
  console.error('Code signing failed:', err);
  process.exit(1);
});
