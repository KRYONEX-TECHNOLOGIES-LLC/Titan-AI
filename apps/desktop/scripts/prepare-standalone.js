/**
 * Flatten pnpm node_modules in the Next.js standalone output.
 * 
 * pnpm uses symlinks to a .pnpm store. NSIS and Windows tar don't handle
 * symlinks reliably, so we resolve them into real copies before archiving.
 * 
 * Run AFTER `next build` and BEFORE tarring the standalone directory.
 */
const fs = require('fs');
const path = require('path');

const STANDALONE_DIR = path.resolve(__dirname, '../../web/.next/standalone');

function flattenPnpmNodeModules(nodeModulesDir) {
  const pnpmDir = path.join(nodeModulesDir, '.pnpm');

  if (fs.existsSync(pnpmDir)) {
    const storeEntries = fs.readdirSync(pnpmDir);
    for (const storeEntry of storeEntries) {
      if (storeEntry === 'node_modules' || storeEntry === 'lock.yaml') continue;
      const innerNM = path.join(pnpmDir, storeEntry, 'node_modules');
      if (!fs.existsSync(innerNM)) continue;
      let innerPkgs;
      try { innerPkgs = fs.readdirSync(innerNM); } catch { continue; }

      for (const pkg of innerPkgs) {
        if (pkg === '.pnpm' || pkg.startsWith('.')) continue;
        const src = path.join(innerNM, pkg);

        if (pkg.startsWith('@')) {
          let scopedPkgs;
          try { scopedPkgs = fs.readdirSync(src); } catch { continue; }
          for (const sp of scopedPkgs) {
            const scopedDest = path.join(nodeModulesDir, pkg, sp);
            if (fs.existsSync(scopedDest)) continue;
            try {
              const realSrc = fs.realpathSync(path.join(src, sp));
              fs.mkdirSync(path.join(nodeModulesDir, pkg), { recursive: true });
              fs.cpSync(realSrc, scopedDest, { recursive: true });
            } catch (err) {
              console.warn(`[flatten] skip @scoped ${pkg}/${sp}: ${err.message}`);
            }
          }
        } else {
          const dest = path.join(nodeModulesDir, pkg);
          if (fs.existsSync(dest) && !fs.lstatSync(dest).isSymbolicLink()) continue;
          try {
            const realSrc = fs.realpathSync(src);
            if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
            fs.cpSync(realSrc, dest, { recursive: true });
          } catch (err) {
            console.warn(`[flatten] skip ${pkg}: ${err.message}`);
          }
        }
      }
    }
    fs.rmSync(pnpmDir, { recursive: true, force: true });
  }

  for (const entry of fs.readdirSync(nodeModulesDir)) {
    if (entry === '.pnpm') continue;
    const fullPath = path.join(nodeModulesDir, entry);
    try {
      if (fs.lstatSync(fullPath).isSymbolicLink()) {
        const real = fs.realpathSync(fullPath);
        fs.rmSync(fullPath, { recursive: true, force: true });
        fs.cpSync(real, fullPath, { recursive: true });
      }
    } catch {}
  }
}

function findAllNodeModules(dir) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (entry.name === '.pnpm') continue;
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules') {
      results.push(full);
    }
    try {
      if (fs.lstatSync(full).isDirectory() && !fs.lstatSync(full).isSymbolicLink()) {
        results.push(...findAllNodeModules(full));
      }
    } catch {}
  }
  return results;
}

if (!fs.existsSync(STANDALONE_DIR)) {
  console.error(`[prepare-standalone] ERROR: ${STANDALONE_DIR} does not exist. Run 'next build' first.`);
  process.exit(1);
}

console.log(`[prepare-standalone] Scanning ${STANDALONE_DIR} for node_modules...`);
const nmDirs = findAllNodeModules(STANDALONE_DIR);
console.log(`[prepare-standalone] Found ${nmDirs.length} node_modules directories to flatten.`);

for (const nmDir of nmDirs) {
  console.log(`[prepare-standalone] Flattening: ${nmDir}`);
  flattenPnpmNodeModules(nmDir);
}

console.log('[prepare-standalone] Done. Standalone is ready for tarring.');
