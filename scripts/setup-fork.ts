/**
 * Setup VS Code Fork
 *
 * This script sets up the Code-OSS fork for Titan AI
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = join(__dirname, '..');
const VSCODE_DIR = join(ROOT_DIR, 'vscode-core');
const VSCODE_REPO = 'https://github.com/microsoft/vscode.git';
const VSCODE_TAG = '1.96.0'; // Pin to specific version

async function main() {
  console.log('🚀 Titan AI - VS Code Fork Setup');
  console.log('================================\n');

  // Check if vscode-core already exists
  if (existsSync(VSCODE_DIR)) {
    console.log('⚠️  vscode-core directory already exists');
    console.log('   Use --force to re-clone\n');
    
    if (!process.argv.includes('--force')) {
      console.log('Skipping clone, running modifications...\n');
      await applyModifications();
      return;
    }
    
    console.log('Force flag detected, removing existing directory...');
    execSync(`rmdir /s /q "${VSCODE_DIR}"`, { stdio: 'inherit' });
  }

  // Clone VS Code
  console.log(`📦 Cloning VS Code ${VSCODE_TAG}...`);
  execSync(
    `git clone --depth 1 --branch ${VSCODE_TAG} ${VSCODE_REPO} "${VSCODE_DIR}"`,
    { stdio: 'inherit' }
  );

  // Apply modifications
  await applyModifications();

  console.log('\n✅ VS Code fork setup complete!');
  console.log('\nNext steps:');
  console.log('  1. cd vscode-core');
  console.log('  2. yarn install');
  console.log('  3. yarn compile');
}

async function applyModifications() {
  console.log('\n🔧 Applying Titan AI modifications...\n');

  // 1. Update product.json for branding
  updateProductJson();

  // 2. Remove telemetry
  removeTelemetry();

  // 3. Create integration points
  createIntegrationPoints();

  // 4. Update build configuration
  updateBuildConfig();
}

function updateProductJson() {
  console.log('  📝 Updating product.json...');
  
  const productPath = join(VSCODE_DIR, 'product.json');
  
  if (!existsSync(productPath)) {
    console.log('     ⚠️  product.json not found, skipping');
    return;
  }

  const product = JSON.parse(readFileSync(productPath, 'utf-8'));

  // Rebrand
  product.nameShort = 'Titan AI';
  product.nameLong = 'Titan AI - AI-Native IDE';
  product.applicationName = 'titan-ai';
  product.dataFolderName = '.titan-ai';
  product.win32MutexName = 'titanai';
  product.licenseName = 'MIT';
  product.licenseUrl = 'https://github.com/KRYONEX-TECHNOLOGIES-LLC/Titan-AI/blob/main/LICENSE';
  product.serverLicenseUrl = 'https://github.com/KRYONEX-TECHNOLOGIES-LLC/Titan-AI/blob/main/LICENSE';

  // Remove Microsoft telemetry endpoints
  delete product.sendASmile;
  delete product.documentationUrl;
  delete product.releaseNotesUrl;
  delete product.keyboardShortcutsUrlMac;
  delete product.keyboardShortcutsUrlLinux;
  delete product.keyboardShortcutsUrlWin;
  delete product.introductoryVideosUrl;
  delete product.tipsAndTricksUrl;
  delete product.newsletterSignupUrl;

  // Disable telemetry
  product.enableTelemetry = false;

  writeFileSync(productPath, JSON.stringify(product, null, 2));
  console.log('     ✓ product.json updated');
}

function removeTelemetry() {
  console.log('  🔒 Removing telemetry...');

  // Create telemetry stub
  const telemetryStubPath = join(VSCODE_DIR, 'src', 'vs', 'platform', 'telemetry', 'common', 'titanStub.ts');
  const telemetryStubDir = join(VSCODE_DIR, 'src', 'vs', 'platform', 'telemetry', 'common');

  if (!existsSync(telemetryStubDir)) {
    console.log('     ⚠️  Telemetry directory not found, skipping');
    return;
  }

  const stubContent = `/**
 * Titan AI Telemetry Stub
 * 
 * All telemetry is disabled in Titan AI.
 * This stub ensures no data is collected.
 */

export class TitanTelemetryService {
  publicLog(_eventName: string, _data?: any): void {
    // No-op: Telemetry disabled
  }

  publicLog2<E extends string, T extends Record<string, unknown>>(_eventName: E, _data?: T): void {
    // No-op: Telemetry disabled
  }

  setEnabled(_enabled: boolean): void {
    // No-op: Always disabled
  }

  get isOptedIn(): boolean {
    return false;
  }
}
`;

  writeFileSync(telemetryStubPath, stubContent);
  console.log('     ✓ Telemetry stub created');
}

function createIntegrationPoints() {
  console.log('  🔌 Creating integration points...');

  const integrationDir = join(VSCODE_DIR, 'src', 'vs', 'titan');

  if (!existsSync(integrationDir)) {
    mkdirSync(integrationDir, { recursive: true });
  }

  // Create main integration file
  const integrationContent = `/**
 * Titan AI Integration
 * 
 * Entry point for Titan AI features in VS Code
 */

// This file will be populated during the build process
// with imports from @titan/* packages

export const TITAN_VERSION = '0.1.0';
export const TITAN_AI_ENABLED = true;

export interface TitanIntegration {
  initialize(): Promise<void>;
  dispose(): void;
}

// Placeholder - will be replaced during build
export function createTitanIntegration(): TitanIntegration {
  return {
    async initialize() {
      console.log('[Titan AI] Initializing...');
    },
    dispose() {
      console.log('[Titan AI] Disposing...');
    }
  };
}
`;

  writeFileSync(join(integrationDir, 'index.ts'), integrationContent);
  console.log('     ✓ Integration point created');
}

function updateBuildConfig() {
  console.log('  ⚙️  Updating build configuration...');

  // This would update gulp tasks, webpack config, etc.
  // For now, just create a marker file

  const configPath = join(VSCODE_DIR, '.titan-configured');
  writeFileSync(configPath, JSON.stringify({
    version: '0.1.0',
    configuredAt: new Date().toISOString(),
    modifications: [
      'product.json rebranding',
      'telemetry removal',
      'integration points',
    ]
  }, null, 2));

  console.log('     ✓ Build configuration marker created');
}

main().catch((error) => {
  console.error('\n❌ Setup failed:', error);
  process.exit(1);
});
