import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const publicRoot = path.join(root, 'public', 'ocr');
const coreSource = path.join(root, 'node_modules', 'tesseract.js-core');
const workerSource = path.join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
const languageSource = path.join(root, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz');

await mkdir(path.join(publicRoot, 'core'), { recursive: true });
await mkdir(path.join(publicRoot, 'lang'), { recursive: true });
await copyFile(workerSource, path.join(publicRoot, 'worker.min.js'));
await copyFile(languageSource, path.join(publicRoot, 'lang', 'eng.traineddata.gz'));

const coreFiles = await readdir(coreSource);
const requiredCoreFiles = [
  'tesseract-core.wasm.js',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
];
for (const file of requiredCoreFiles) {
  if (!coreFiles.includes(file)) throw new Error(`Missing required local OCR runtime: ${file}`);
  await copyFile(path.join(coreSource, file), path.join(publicRoot, 'core', file));
}
for (const file of coreFiles.filter((name) => name.endsWith('.wasm'))) {
  await copyFile(path.join(coreSource, file), path.join(publicRoot, 'core', file));
}
console.log('Bundled Tesseract worker, English traineddata, and WASM core locally.');
