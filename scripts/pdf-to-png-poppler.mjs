import poppler from 'pdf-poppler';
import path from 'node:path';
import fs from 'node:fs';

const src = process.argv[2];
const outDir = process.argv[3] || './anexo_g_pages';
fs.mkdirSync(outDir, { recursive: true });

const opts = {
  format: 'png',
  out_dir: outDir,
  out_prefix: 'page',
  page: null,    // null = todas
  scale: 1500,   // ancho aproximado en px
};

console.log(`Convirtiendo ${src}...`);
const res = await poppler.convert(src, opts);
console.log('Listo.');
const files = fs.readdirSync(outDir).filter(f => f.endsWith('.png')).sort();
for (const f of files) console.log(`  ${path.join(outDir, f)}`);
