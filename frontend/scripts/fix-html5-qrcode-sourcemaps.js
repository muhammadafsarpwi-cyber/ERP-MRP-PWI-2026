/**
 * Postinstall script: Remove broken source maps from html5-qrcode.
 *
 * html5-qrcode 2.3.8 ships .js.map files whose internal "sources" paths
 * reference TypeScript source files (e.g. "../../../src/camera/core-impl.ts")
 * that are NOT included in the published npm package. When CRA/webpack
 * encounters these source maps it logs "Failed to parse source map" warnings
 * on every build (including Vercel).
 *
 * This script removes the broken .map files after npm install so webpack
 * never tries to parse them. The barcode/camera scanner runtime is unaffected
 * because source maps are only used for debugging, not execution.
 */

const fs = require('fs');
const path = require('path');

const targetDir = path.join(
  __dirname,
  '..',
  'node_modules',
  'html5-qrcode'
);

if (!fs.existsSync(targetDir)) {
  // Package not installed yet (e.g. running outside of npm context). Skip silently.
  process.exit(0);
}

let removed = 0;

function removeMapFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeMapFiles(fullPath);
    } else if (entry.name.endsWith('.js.map')) {
      fs.unlinkSync(fullPath);
      removed++;
    }
  }
}

removeMapFiles(targetDir);

if (removed > 0) {
  console.log(`[fix-html5-qrcode-sourcemaps] Removed ${removed} broken .map files from html5-qrcode`);
} else {
  console.log('[fix-html5-qrcode-sourcemaps] No .map files found to remove (already clean)');
}
