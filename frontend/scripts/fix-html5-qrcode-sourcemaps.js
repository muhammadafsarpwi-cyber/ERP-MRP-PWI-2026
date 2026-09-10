/**
 * Postinstall script: Remove broken source maps from html5-qrcode.
 *
 * html5-qrcode 2.3.8 ships .js.map files whose internal "sources" paths
 * reference TypeScript source files (e.g. "../../../src/camera/core-impl.ts")
 * that are NOT included in the published npm package. When CRA/webpack/Vercel
 * encounters these source maps it logs "Failed to parse source map" warnings.
 *
 * This script:
 *   1. Removes all .js.map files from the html5-qrcode package.
 *   2. Strips sourceMappingURL comments from .js files so webpack/Vercel
 *      no longer attempts to load the missing source maps.
 *
 * The barcode/camera scanner runtime is unaffected because source maps are
 * only used for debugging, not execution.
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
  process.exit(0);
}

let removedMaps = 0;
let patchedFiles = 0;

// Step 1: Remove all .js.map files
function removeMapFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeMapFiles(fullPath);
    } else if (entry.name.endsWith('.js.map')) {
      fs.unlinkSync(fullPath);
      removedMaps++;
    }
  }
}

removeMapFiles(targetDir);

// Step 2: Strip sourceMappingURL comments from .js files
// Matches both:  //# sourceMappingURL=foo.js.map
//           and:  /*# sourceMappingURL=foo.js.map */
const SOURCEMAP_REGEX = /\s*\/\/#\s*sourceMappingURL=\S+/g;
const SOURCEMAP_BLOCK_REGEX = /\s*\/\*#\s*sourceMappingURL=\S+\s*\*\//g;

function stripSourceMappingURL(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      stripSourceMappingURL(fullPath);
    } else if (entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('sourceMappingURL')) {
        const cleaned = content
          .replace(SOURCEMAP_REGEX, '')
          .replace(SOURCEMAP_BLOCK_REGEX, '');
        if (cleaned !== content) {
          fs.writeFileSync(fullPath, cleaned, 'utf8');
          patchedFiles++;
        }
      }
    }
  }
}

stripSourceMappingURL(targetDir);

console.log(
  `[fix-html5-qrcode-sourcemaps] Removed ${removedMaps} .map files, stripped sourceMappingURL from ${patchedFiles} .js files`
);
