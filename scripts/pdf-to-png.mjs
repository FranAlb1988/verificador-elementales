import { pdfToPng } from 'pdf-to-png-converter';
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
const outDir = process.argv[3] || './anexo_g_pages';
const pages = process.argv[4] ? process.argv[4].split(',').map(Number) : null;

fs.mkdirSync(outDir, { recursive: true });
const pngs = await pdfToPng(src, {
  outputFolder: outDir,
  outputFileMaskFunc: (n) => `page_${String(n).padStart(2, '0')}.png`,
  viewportScale: 1.4,
  pagesToProcess: pages || undefined,
});
console.log(`Generadas ${pngs.length} páginas en ${outDir}`);
for (const p of pngs) console.log(`  ${p.path}`);
