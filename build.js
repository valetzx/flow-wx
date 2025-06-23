import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'dist');
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const apiDomains = (process.env.API_DOMAINS || '').split(/[\s,]+/).filter(Boolean);
const imgDomains = (process.env.IMG_DOMAINS || '').split(/[\s,]+/).filter(Boolean);
const cacheImgDomain = process.env.IMG_CACHE || '';

function injectConfig(html) {
  if (!apiDomains.length && !imgDomains.length) return html;
  const script = `<script>window.API_DOMAINS=${JSON.stringify(apiDomains)};window.IMG_DOMAINS=${JSON.stringify(imgDomains)};</script>`;
  return html.replace('</head>', `${script}</head>`);
}

async function buildHtml(name) {
  const raw = await fs.readFile(path.join(__dirname, name), 'utf8');
  const html = injectConfig(raw);
  const outName = name === 'main.html' ? 'index.html' : name;
  await fs.writeFile(path.join(outDir, outName), html);
}

await buildHtml('main.html');
await buildHtml('ideas.html');
await buildHtml('admin.html');

const swRaw = await fs.readFile(path.join(__dirname, 'sw.js'), 'utf8');
const swOut = `const IMG_CACHE = ${JSON.stringify(cacheImgDomain)};\n${swRaw}`;
await fs.writeFile(path.join(outDir, 'sw.js'), swOut);

console.log('Build complete in', outDir);
