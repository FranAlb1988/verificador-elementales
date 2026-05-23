// Análisis exploratorio del DXF. Saca estadísticas para diseñar heurísticas.
import fs from 'node:fs';
import DxfParser from 'dxf-parser';

const path = process.argv[2] || 'D:/Francisco/RAJO INCA/03200/ELEMENTALES/P268-PL-03200-EL-031-0T.dxf';
const dxf = new DxfParser().parseSync(fs.readFileSync(path, 'utf8'));

const ents = dxf.entities;
const byType = {};
for (const e of ents) byType[e.type] = (byType[e.type] || 0) + 1;

console.log('=== TIPOS DE ENTIDADES ===');
for (const [t, n] of Object.entries(byType).sort((a,b)=>b[1]-a[1])) console.log(`  ${n}\t${t}`);

console.log('\n=== LAYERS ===');
const layers = {};
for (const e of ents) {
  const k = e.layer || '?';
  layers[k] = (layers[k] || 0) + 1;
}
for (const [l, n] of Object.entries(layers).sort((a,b)=>b[1]-a[1])) console.log(`  ${n}\t${l}`);

// CIRCLES
console.log('\n=== CIRCLES ===');
const circles = ents.filter(e => e.type === 'CIRCLE');
const radii = circles.map(c => c.radius);
const bucket = {};
for (const r of radii) {
  const k = Math.round(r * 10) / 10;
  bucket[k] = (bucket[k] || 0) + 1;
}
console.log('  radios y conteos:');
for (const [r, n] of Object.entries(bucket).sort((a,b)=>parseFloat(a[0])-parseFloat(b[0]))) console.log(`    r=${r}\t${n}`);

// LINES
console.log('\n=== LINES ===');
const lines = ents.filter(e => e.type === 'LINE');
const lengths = lines.map(l => Math.hypot(l.vertices[1].x - l.vertices[0].x, l.vertices[1].y - l.vertices[0].y));
console.log(`  total: ${lines.length}`);
console.log(`  min: ${Math.min(...lengths).toFixed(2)}  max: ${Math.max(...lengths).toFixed(2)}`);
// Histograma simple
const lenBucket = {};
for (const L of lengths) {
  const k = L < 5 ? '<5' : L < 10 ? '5-10' : L < 20 ? '10-20' : L < 50 ? '20-50' : L < 100 ? '50-100' : L < 200 ? '100-200' : L < 500 ? '200-500' : '500+';
  lenBucket[k] = (lenBucket[k] || 0) + 1;
}
console.log('  histograma:');
for (const [k, n] of Object.entries(lenBucket)) console.log(`    ${k}\t${n}`);

// Orientación de líneas
let H=0, V=0, D=0;
for (const l of lines) {
  const dx = Math.abs(l.vertices[1].x - l.vertices[0].x);
  const dy = Math.abs(l.vertices[1].y - l.vertices[0].y);
  if (dy < 0.1) H++;
  else if (dx < 0.1) V++;
  else D++;
}
console.log(`  horizontales: ${H}  verticales: ${V}  diagonales: ${D}`);

// TEXT
console.log('\n=== TEXT / MTEXT ===');
const texts = ents.filter(e => e.type === 'TEXT' || e.type === 'MTEXT');
console.log(`  total: ${texts.length}`);
const sample = texts.slice(0, 40);
console.log('  primeros 40:');
for (const t of sample) {
  const s = (t.text || t.string || '').replace(/\s+/g, ' ').slice(0, 60);
  const x = (t.position?.x ?? t.startPoint?.x ?? 0).toFixed(1);
  const y = (t.position?.y ?? t.startPoint?.y ?? 0).toFixed(1);
  const h = (t.height || t.textHeight || 0).toFixed(2);
  console.log(`    (${x},${y}) h=${h}  "${s}"`);
}

// BBOX
let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
for (const e of ents) {
  const pts = [];
  if (e.type === 'LINE') pts.push(...e.vertices);
  else if (e.type === 'CIRCLE' || e.type === 'ARC') pts.push({x:e.center.x-e.radius, y:e.center.y-e.radius}, {x:e.center.x+e.radius, y:e.center.y+e.radius});
  else if (e.type === 'LWPOLYLINE') pts.push(...e.vertices);
  else if (e.type === 'TEXT' || e.type === 'MTEXT') { const p = e.position || e.startPoint; if (p) pts.push(p); }
  else if (e.type === 'INSERT') pts.push(e.position);
  for (const p of pts) {
    if (typeof p.x === 'number') { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); }
    if (typeof p.y === 'number') { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  }
}
console.log(`\n=== BBOX ===\n  X: ${minX.toFixed(1)} .. ${maxX.toFixed(1)}  (ancho ${(maxX-minX).toFixed(1)})`);
console.log(`  Y: ${minY.toFixed(1)} .. ${maxY.toFixed(1)}  (alto ${(maxY-minY).toFixed(1)})`);
