import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (typeof Bun === 'undefined' || Bun.version !== '1.4.4') throw new Error('Build requires Bun 1.4.4');
const target = process.argv[2] || 'bun-linux-arm64';
if (!['bun-linux-arm64', 'bun-darwin-arm64'].includes(target)) throw new Error('Unsupported build target');
const version = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(version)) throw new Error('Build requires a Git commit');
const verifyAssets = async (directory) => {
  for (const entry of await readdir(directory)) {
    const file = path.join(directory, entry);
    const stat = await lstat(file);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || entry.startsWith('.')) throw new Error(`Unsafe embedded asset: ${file}`);
    if (stat.isDirectory()) await verifyAssets(file);
  }
};
await readFile('dist/index.html');
await verifyAssets('dist');
const name = `tashome-${target.replace('bun-', '')}`;
const output = path.join('artifacts', target);
await mkdir(output, { recursive: true });
const binary = path.join(output, name);
const result = await Bun.build({
  entrypoints: ['./server.js'],
  compile: { target, outfile: binary, assets: ['./dist'], autoloadDotenv: false, autoloadBunfig: false },
  minify: true,
  define: { BUILD_VERSION: JSON.stringify(version), 'process.env.NODE_ENV': JSON.stringify('production') },
  // ponytail: binary includes only Vite assets; runtime state is always external.
  env: 'disable'
});
if (!result.success) throw new AggregateError(result.logs, 'Binary build failed');
await chmod(binary, 0o755);
const sha256 = createHash('sha256').update(await readFile(binary)).digest('hex');
const manifest = `${JSON.stringify({ version, target, binary: name, sha256 }, null, 2)}\n`;
await writeFile(path.join(output, 'manifest.json'), manifest);
const manifestHash = createHash('sha256').update(manifest).digest('hex');
await writeFile(path.join(output, 'SHA256SUMS'), `${sha256}  ${name}\n${manifestHash}  manifest.json\n`);
console.log(`Built ${binary} (${version})`);
