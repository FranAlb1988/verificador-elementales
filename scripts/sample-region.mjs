// Extrae entidades cercanas a un texto conocido (p.ej. "EMERG", "PARTIR", "PARAR",
// "M") para entender el vocabulario geométrico real del DXF.
import fs from 'node:fs';
import DxfParser from 'dxf-parser';

const path = process.argv[2] || 'D:/Francisco/RAJO INCA/03200/ELEMENTALES/P268-PL-03200-EL-031-0T.dxf';
const target = process.argv[3] || 'PARTIR';
const radius = parseFloat(process.argv[4]) || 25;

const dxf = new DxfParser().parseSync(fs.readFileSync(path, 'utf8'));
const ents = dxf.entities;

// Buscar todos los textos que matchen
const texts = ents.filter(e => (e.type === 'TEXT' || e.type === 'MTEXT'));
const matches = texts.filter(t => {
  const s = (t.text || t.string || '').toUpperCase();
  return s.includes(target.toUpperCase());
});

console.log(`Textos que matchean "${target}": ${matches.length}`);
for (const m of matches) {
  const p = m.position || m.startPoint;
  console.log(`  en (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) layer=${m.layer} h=${m.height||m.textHeight}  "${(m.text||m.string).trim()}"`);
}

for (const m of matches.slice(0, 1)) {
  const p = m.position || m.startPoint;
  console.log(`\n=== Entidades dentro de r=${radius} desde (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) ===`);
  const near = [];
  for (const e of ents) {
    let q = null;
    if (e.type === 'LINE') q = midpoint(e.vertices[0], e.vertices[1]);
    else if (e.type === 'CIRCLE' || e.type === 'ARC') q = e.center;
    else if (e.type === 'LWPOLYLINE') q = e.vertices[0];
    else if (e.type === 'TEXT' || e.type === 'MTEXT') q = e.position || e.startPoint;
    if (!q) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= radius) near.push({ e, d });
  }
  near.sort((a, b) => a.d - b.d);
  for (const { e, d } of near) {
    if (e.type === 'LINE') {
      const a = e.vertices[0], b = e.vertices[1];
      const L = Math.hypot(b.x-a.x, b.y-a.y);
      const ang = (Math.atan2(b.y-a.y, b.x-a.x) * 180 / Math.PI).toFixed(0);
      console.log(`  d=${d.toFixed(1)}\tLINE\t(${a.x.toFixed(1)},${a.y.toFixed(1)})→(${b.x.toFixed(1)},${b.y.toFixed(1)})  L=${L.toFixed(1)}  ang=${ang}°  layer=${e.layer}`);
    } else if (e.type === 'CIRCLE') {
      console.log(`  d=${d.toFixed(1)}\tCIRCLE\tc=(${e.center.x.toFixed(1)},${e.center.y.toFixed(1)})  r=${e.radius.toFixed(2)}  layer=${e.layer}`);
    } else if (e.type === 'ARC') {
      console.log(`  d=${d.toFixed(1)}\tARC\tc=(${e.center.x.toFixed(1)},${e.center.y.toFixed(1)})  r=${e.radius.toFixed(2)}  ${(e.startAngle||0).toFixed(0)}°→${(e.endAngle||0).toFixed(0)}°  layer=${e.layer}`);
    } else if (e.type === 'TEXT' || e.type === 'MTEXT') {
      const q = e.position || e.startPoint;
      const txt = (e.text||e.string).replace(/\s+/g,' ').slice(0,30);
      console.log(`  d=${d.toFixed(1)}\tTEXT\t(${q.x.toFixed(1)},${q.y.toFixed(1)})  h=${(e.height||e.textHeight||0).toFixed(2)}  "${txt}"  layer=${e.layer}`);
    } else if (e.type === 'LWPOLYLINE') {
      console.log(`  d=${d.toFixed(1)}\tLWPOLYLINE\tvertices=${e.vertices.length}  layer=${e.layer}`);
    }
  }
}

function midpoint(a, b) { return { x: (a.x+b.x)/2, y: (a.y+b.y)/2 }; }
