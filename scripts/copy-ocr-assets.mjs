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
const runtimeFiles = coreFiles.filter((name) => /^tesseract-core.*\.(?:js|wasm)$/.test(name));
if (!runtimeFiles.some((name) => name.endsWith('.wasm.js'))) {
  throw new Error('The installed Tesseract.js core package has no browser runtime files.');
}
for (const file of runtimeFiles) {
  await copyFile(path.join(coreSource, file), path.join(publicRoot, 'core', file));
}
console.log('Bundled Tesseract worker, English traineddata, and WASM core locally.');
