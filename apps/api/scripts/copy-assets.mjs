// Copy non-TS runtime assets (the OEFA .md corpus) from src into dist so the
// compiled build can load them at runtime. tsc only emits .js/.d.ts, so without
// this step loadSeedCorpus() would ENOENT in a built/production runtime.
import { cp, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, '..');

const assets = [
  // [from (relative to apps/api), to]
  ['src/data/oefa/docs', 'dist/data/oefa/docs'],
];

for (const [from, to] of assets) {
  await cp(join(apiRoot, from), join(apiRoot, to), { recursive: true });
  const files = await readdir(join(apiRoot, to));
  console.log(`copied ${files.length} asset(s): ${from} → ${to}`);
}
