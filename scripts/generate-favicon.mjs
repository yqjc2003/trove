// Rebuild raster exports from the SVG source, using Next's bundled sharp dependency.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve('next/package.json'));
const sharp = nextRequire('sharp');
const root = new URL('../', import.meta.url);
const svg = await readFile(new URL('src/app/icon.svg', root));
const sizes = [16, 32, 48, 64, 128, 256];
const frames = await Promise.all(sizes.map((size) =>
  sharp(svg, { density: 384 }).resize(size, size).png().toBuffer(),
));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2); // ICO
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index] === 256 ? 0 : sizes[index];
  directory[entry + 1] = directory[entry];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
const ico = Buffer.concat([directory, ...frames]);
await mkdir(new URL('public/', root), { recursive: true });
for (const path of ['src/app/favicon.ico', 'public/favorite.ico']) {
  await writeFile(new URL(path, root), ico);
  console.log(`Generated ${fileURLToPath(new URL(path, root))}`);
}
await sharp(svg, { density: 768 }).resize(512, 512).png()
  .toFile(fileURLToPath(new URL('public/catchlinger-icon.png', root)));
