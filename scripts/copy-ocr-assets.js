const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src', 'vendor', 'tesseract');
const dest = path.join(root, 'build', 'vendor', 'tesseract');

fs.mkdirSync(dest, { recursive: true });
for (const file of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, file), path.join(dest, file));
}
console.log(`[copy-ocr-assets] copied ${fs.readdirSync(src).length} OCR assets to build/vendor/tesseract`);
