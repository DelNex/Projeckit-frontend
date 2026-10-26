import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetPath = path.resolve(frontendRoot, process.argv[2] || 'node_modules/@techstark/opencv-js/dist/opencv.js');
const asset = await fs.readFile(assetPath);
const gzipBytes = gzipSync(asset, { level: 9 }).byteLength;
const measurement = {
  asset: path.relative(frontendRoot, assetPath),
  rawBytes: asset.byteLength,
  rawMiB: Number((asset.byteLength / 1024 / 1024).toFixed(2)),
  gzipBytes,
  gzipMiB: Number((gzipBytes / 1024 / 1024).toFixed(2)),
  measuredAt: new Date().toISOString(),
};
const outputPath = path.join(frontendRoot, 'docs/research/opencv-asset-size.json');
await fs.mkdir(path.dirname(outputPath), { recursive: true });
let previous = [];
try {
  const saved = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  previous = Array.isArray(saved.records) ? saved.records : saved.rawBytes ? [saved] : [];
} catch { /* First release measurement. */ }
const record = { schemaVersion: 1, records: [...previous, measurement] };
await fs.writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(`${JSON.stringify(measurement, null, 2)}\nSaved ${outputPath}`);
