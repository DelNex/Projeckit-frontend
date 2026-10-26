import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const manifests = [
  { name: 'project-kit-frontend', manifest: 'frontend/package-lock.json', lockfile: path.join(frontendRoot, 'package-lock.json') },
  { name: 'project-kit-backend', manifest: 'backend/package-lock.json', lockfile: path.join(repositoryRoot, 'backend/package-lock.json') },
  { name: 'project-kit-gemini-helper', manifest: 'helper/package-lock.json', lockfile: path.join(repositoryRoot, 'helper/package-lock.json') },
];
const outputDir = path.join(frontendRoot, 'docs/research/sbom');

function packagePurl(name, version) {
  const encodedName = name.startsWith('@') ? `%40${name.slice(1).replace('/', '%2f')}` : encodeURIComponent(name);
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function componentRef(name, version, packagePath) {
  const purl = packagePurl(name, version);
  const pathHash = createHash('sha256').update(packagePath).digest('hex').slice(0, 12);
  return `${purl}?package_path=${pathHash}`;
}

function findDependencyPath(packagePath, dependencyName, packages) {
  let parent = packagePath;
  while (true) {
    const candidate = parent ? `${parent}/node_modules/${dependencyName}` : `node_modules/${dependencyName}`;
    if (packages[candidate]) return candidate;
    const marker = parent.lastIndexOf('/node_modules/');
    if (marker >= 0) parent = parent.slice(0, marker);
    else if (parent.startsWith('node_modules/')) parent = '';
    else return undefined;
  }
}

function licenseFor(value) {
  if (!value) return undefined;
  const expression = typeof value === 'string' ? value : value.type;
  if (!expression) return undefined;
  return [{ expression }];
}

async function buildSbom(workspace) {
  const lock = JSON.parse(await fs.readFile(workspace.lockfile, 'utf8'));
  const lockPackages = lock.packages || {};
  const rootManifest = lockPackages[''] || {};
  const rootVersion = rootManifest.version || '0.0.0';
  const rootRef = packagePurl(rootManifest.name || workspace.name, rootVersion);
  const refs = new Map();
  const packages = Object.entries(lockPackages).filter(([packagePath, pkg]) => packagePath && !pkg.link && pkg.version);
  for (const [packagePath, pkg] of packages) refs.set(packagePath, componentRef(pkg.name || packagePath.split('/').at(-1), pkg.version, packagePath));

  const components = packages.map(([packagePath, pkg]) => {
    const component = {
      type: 'library',
      name: pkg.name || packagePath.split('/').at(-1),
      version: pkg.version,
      'bom-ref': refs.get(packagePath),
      purl: packagePurl(pkg.name || packagePath.split('/').at(-1), pkg.version),
      properties: [
        { name: 'projectkit:lockfilePath', value: packagePath },
        { name: 'projectkit:dev', value: String(Boolean(pkg.dev)) },
        { name: 'projectkit:optional', value: String(Boolean(pkg.optional)) },
      ],
    };
    const license = licenseFor(pkg.license);
    if (license) component.licenses = license;
    if (pkg.integrity) {
      const [algorithm, digest] = pkg.integrity.split('-', 2);
      if (algorithm && digest) component.hashes = [{ alg: algorithm.toUpperCase(), content: digest }];
    }
    if (pkg.resolved) component.externalReferences = [{ type: 'distribution', url: pkg.resolved }];
    return component;
  });

  const dependencyRows = packages.map(([packagePath, pkg]) => {
    const targets = new Set();
    for (const dependencyName of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) {
      const targetPath = findDependencyPath(packagePath, dependencyName, lockPackages);
      const ref = targetPath && refs.get(targetPath);
      if (ref) targets.add(ref);
    }
    return { ref: refs.get(packagePath), dependsOn: [...targets].sort() };
  });
  const rootDependencies = new Set();
  for (const dependencyName of Object.keys({ ...rootManifest.dependencies, ...rootManifest.devDependencies, ...rootManifest.optionalDependencies })) {
    const targetPath = findDependencyPath('', dependencyName, lockPackages);
    const ref = targetPath && refs.get(targetPath);
    if (ref) rootDependencies.add(ref);
  }
  dependencyRows.push({ ref: rootRef, dependsOn: [...rootDependencies].sort() });

  return {
    $schema: 'http://cyclonedx.org/schema/bom-1.5.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      lifecycles: [{ phase: 'pre-build' }],
      tools: { components: [{ type: 'application', name: 'Project KIT lockfile SBOM generator', version: '1.0.0' }] },
      component: {
        type: 'application',
        name: rootManifest.name || workspace.name,
        version: rootVersion,
        'bom-ref': rootRef,
        properties: [{ name: 'projectkit:sourceLockfile', value: workspace.manifest }],
      },
      properties: [
        { name: 'projectkit:sourceLockfile', value: workspace.manifest },
        { name: 'projectkit:scope', value: 'all package-lock entries with exact versions, including development and optional packages' },
      ],
    },
    components,
    dependencies: dependencyRows,
  };
}

await fs.mkdir(outputDir, { recursive: true });
for (const workspace of manifests) {
  const bom = await buildSbom(workspace);
  const outputPath = path.join(outputDir, `${workspace.name}.cdx.json`);
  await fs.writeFile(outputPath, `${JSON.stringify(bom, null, 2)}\n`);
  console.log(`${workspace.manifest}: ${bom.components.length} locked components -> ${outputPath}`);
}
