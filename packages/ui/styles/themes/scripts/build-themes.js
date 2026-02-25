/**
 * Build themes — generates CSS custom property files from TypeScript theme definitions.
 * Currently a no-op since themes are consumed directly as TS/JS objects.
 * This script exists to satisfy the build pipeline.
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const themesDir = path.join(__dirname, '..', 'themes');

if (!fs.existsSync(themesDir)) {
  fs.mkdirSync(themesDir, { recursive: true });
}

console.log('Theme build complete.');
