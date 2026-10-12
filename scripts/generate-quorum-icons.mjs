import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps', 'quorum', 'app');
const source = await readFile(path.join(root, 'public', 'favicon.svg'), 'utf8');

function sourceImage(id) {
  const start = source.indexOf(`<g id="${id}">`);
  if (start < 0) throw new Error(`Missing Politeia favicon variant: ${id}`);
  const end = id === 'light-icon' ? source.indexOf('<g id="dark-icon">', start) : source.length;
  const image = source.slice(start, end).match(/<image\b[^>]*\b(?:xlink:)?href="data:image\/png;base64,([^"]+)"/);
  if (!image) throw new Error(`Missing PNG source for Politeia favicon variant: ${id}`);
  return Buffer.from(image[1], 'base64');
}

// The parent monogram is a lowercase p. Reflecting it produces its matching q,
// preserving the original curves, shading, stroke weights and clear space.
const light = await sharp(sourceImage('light-icon')).flop().png({ compressionLevel: 9 }).toBuffer();
const dark = await sharp(sourceImage('dark-icon')).flop().png({ compressionLevel: 9 }).toBuffer();
const { width, height } = await sharp(light).metadata();
const darkSize = await sharp(dark).metadata();
if (width !== height || darkSize.width !== width || darkSize.height !== height) {
  throw new Error('Politeia favicon variants must share the same square canvas.');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>Quórum</title>
  <style>
    #light-icon { display: inline; }
    #dark-icon { display: none; }
    @media (prefers-color-scheme: dark) {
      #light-icon { display: none; }
      #dark-icon { display: inline; }
    }
  </style>
  <image id="light-icon" width="${width}" height="${height}" href="data:image/png;base64,${light.toString('base64')}" />
  <image id="dark-icon" width="${width}" height="${height}" href="data:image/png;base64,${dark.toString('base64')}" />
</svg>
`;

// Numbered metadata files let Next publish both formats. SVG comes last so
// browsers supporting it select the variant that adapts to their color scheme.
await writeFile(path.join(app, 'icon2.svg'), svg);
await sharp(light).resize(32, 32).png({ compressionLevel: 9 }).toFile(path.join(app, 'icon1.png'));
await sharp(light).resize(180, 180).png({ compressionLevel: 9 }).toFile(path.join(app, 'apple-icon.png'));
console.log('Generated Quórum SVG, 32px favicon and 180px Apple icon from the Politeia monogram.');
