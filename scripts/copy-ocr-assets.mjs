import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public', 'ocr');
const coreSource = path.join(root, 'node_modules', 'tesseract.js-core');
const apiSource = path.join(root, 'node_modules', 'tesseract.js', 'dist', 'tesseract.min.js');
const workerSource = path.join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
const languages = ['eng', 'tgl'];

async function copyRequired(source, destination) {
  const info = await stat(source).catch(() => null);
  if (!info?.isFile() || info.size === 0) {
    throw new Error('Required local OCR asset is missing or empty: ' + source);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return { path: path.relative(root, destination).replaceAll(path.sep, '/'), bytes: info.size };
}

await mkdir(path.join(publicRoot, 'core'), { recursive: true });
const copied = [];
copied.push(await copyRequired(apiSource, path.join(publicRoot, 'tesseract.min.js')));
copied.push(await copyRequired(workerSource, path.join(publicRoot, 'worker.min.js')));

const coreFiles = (await readdir(coreSource))
  .filter((name) => name.startsWith('tesseract-core-') || name === 'tesseract-core.js' || name === 'tesseract-core.wasm' || name === 'tesseract-core.wasm.js')
  .filter((name) => /\.(?:js|wasm)$/.test(name))
  .sort();

const requiredCore = [
  'tesseract-core.wasm.js',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
];
for (const name of requiredCore) {
  if (!coreFiles.includes(name)) throw new Error('Tesseract core package is missing required build: ' + name);
}
for (const name of coreFiles) {
  copied.push(await copyRequired(path.join(coreSource, name), path.join(publicRoot, 'core', name)));
}

for (const language of languages) {
  const source = path.join(root, 'node_modules', '@tesseract.js-data', language, '4.0.0', language + '.traineddata.gz');
  copied.push(await copyRequired(source, path.join(publicRoot, 'lang', language + '.traineddata.gz')));
}

const manifest = {
  engine: 'tesseract.js',
  engineVersion: '7.0.0',
  coreVersion: '7.0.0',
  modelSet: '4.0.0',
  languages,
  assets: copied,
  totalBytes: copied.reduce((total, item) => total + item.bytes, 0),
};
await writeFile(path.join(publicRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared ' + copied.length + ' self-hosted OCR assets (' + manifest.totalBytes + ' bytes).');
