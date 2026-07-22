/**
 * Fails the build when package.json advertises an entry point that does not exist on disk.
 *
 * This catches the class of bug where a package rename leaves `module`/`exports` pointing
 * at the old generated filename: `npm install` still succeeds and only the first `import`
 * in a consumer's app fails with ERR_MODULE_NOT_FOUND.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const targets = [];
const collect = (value, label) => {
  if (typeof value === 'string') {
    if (value.startsWith('./')) targets.push([label, value]);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) collect(nested, `${label}.${key}`);
  }
};

collect(pkg.exports, 'exports');
for (const field of ['main', 'module', 'types', 'browser']) {
  if (pkg[field]) collect(pkg[field].startsWith('./') ? pkg[field] : `./${pkg[field]}`, field);
}

const missing = [];
for (const [label, target] of targets) {
  if (target.includes('*')) {
    // Wildcard subpath: require the containing directory to exist and hold at least one file.
    const dir = join(root, target.slice(2).split('*')[0]);
    const ok = existsSync(dir) && readdirSync(dir).length > 0;
    if (!ok) missing.push([label, target, 'no files match this pattern']);
    continue;
  }
  if (!existsSync(join(root, target.slice(2)))) missing.push([label, target, 'file does not exist']);
}

if (missing.length > 0) {
  console.error(`\n${pkg.name}: package.json points at ${missing.length} missing entry point(s):\n`);
  for (const [label, target, why] of missing) console.error(`  ${label}\n    -> ${target}  (${why})`);
  console.error('\nBuild the package first, or correct these paths. Publishing now would ship a package that cannot be imported.\n');
  process.exit(1);
}

console.log(`${pkg.name}: all ${targets.length} declared entry points exist.`);
