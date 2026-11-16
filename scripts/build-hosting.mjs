import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const sourceDir = join(root, 'hosting');
const fontDir = join(root, 'public', 'fonts');
const outDir = join(root, 'hosting-dist');

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'fonts'), { recursive: true });

  await cp(join(sourceDir, 'index.html'), join(outDir, 'index.html'));
  await cp(join(sourceDir, 'favicon.svg'), join(outDir, 'favicon.svg'));

  const fonts = (await readdir(fontDir)).filter((name) => name.endsWith('.woff2')).sort();
  for (const name of fonts) {
    await cp(join(fontDir, name), join(outDir, 'fonts', name));
  }

  const files = await listFiles(outDir);
  const lines = [];
  for (const file of files) {
    const digest = createHash('sha256').update(await readFile(file)).digest('hex');
    lines.push(`${digest}  ${relative(outDir, file).split(sep).join('/')}`);
  }
  await writeFile(join(outDir, 'checksums.sha256'), `${lines.join('\n')}\n`);

  console.log(`Built the static hosting output in ${relative(root, outDir)}`);
}

await main();
