import poppler from 'pdf-poppler';
import fs from 'node:fs';

const src = process.argv[2];
const outDir = process.argv[3];
const page = parseInt(process.argv[4]);
const scale = parseInt(process.argv[5] || '3000');
fs.mkdirSync(outDir, { recursive: true });
await poppler.convert(src, {
  format: 'png',
  out_dir: outDir,
  out_prefix: `hires-p${page}`,
  page,
  scale,
});
console.log('OK');
