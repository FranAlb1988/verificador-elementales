// Prueba clustering + fingerprint sobre el DXF real.
import fs from 'node:fs';
import DxfParser from 'dxf-parser';
import { clusterSymbols, clusterBbox } from '../src/import/cluster.js';
import { groupByFingerprint } from '../src/import/fingerprint.js';

const path = process.argv[2] || 'D:/Francisco/RAJO INCA/03200/ELEMENTALES/P268-PL-03200-EL-031-0T.dxf';
const dxf = new DxfParser().parseSync(fs.readFileSync(path, 'utf8'));

// Aplanar bloques (igual que parseDxf en el browser).
const blocks = dxf.blocks || {};
function expand(ents, depth=0) {
  if (depth > 4) return [];
  const out = [];
  for (const e of ents) {
    if (e.type === 'INSERT') {
      const blk = blocks[e.name];
      if (blk?.entities) {
        const sx = e.xScale ?? 1, sy = e.yScale ?? 1;
        const rot = (e.rotation || 0) * Math.PI / 180;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const ox = e.position?.x || 0, oy = e.position?.y || 0;
        const ix = blk.position?.x || 0, iy = blk.position?.y || 0;
        const T = (p) => {
          const x0 = (p.x - ix) * sx, y0 = (p.y - iy) * sy;
          return { x: ox + x0*cos - y0*sin, y: oy + x0*sin + y0*cos };
        };
        for (const s of expand(blk.entities, depth+1)) {
          if (s.type === 'LINE') out.push({ ...s, vertices: s.vertices.map(T), layer: s.layer === '0' ? e.layer : s.layer });
          else if (s.type === 'CIRCLE' || s.type === 'ARC') out.push({ ...s, center: T(s.center), layer: s.layer === '0' ? e.layer : s.layer });
          else if (s.type === 'LWPOLYLINE') out.push({ ...s, vertices: s.vertices.map(T), layer: s.layer === '0' ? e.layer : s.layer });
          else if (s.type === 'TEXT' || s.type === 'MTEXT') out.push({ ...s, position: T(s.position || s.startPoint), layer: s.layer === '0' ? e.layer : s.layer });
          else out.push(s);
        }
      }
    } else out.push(e);
  }
  return out;
}
const entities = expand(dxf.entities);

console.time('cluster');
const clusters = clusterSymbols(entities, { eps: 4 });
console.timeEnd('cluster');
console.log(`Clusters totales: ${clusters.length}`);
console.log(`Tamaños: min=${Math.min(...clusters.map(c=>c.length))} max=${Math.max(...clusters.map(c=>c.length))} avg=${(clusters.reduce((s,c)=>s+c.length,0)/clusters.length).toFixed(1)}`);

const groups = groupByFingerprint(clusters);
console.log(`\nPatrones únicos: ${groups.size}`);

// Ordenar por cantidad de instancias (desc)
const sorted = [...groups.values()].sort((a, b) => b.instances.length - a.instances.length);
console.log('\nTop 25 patrones:');
for (const g of sorted.slice(0, 25)) {
  const fp = g.fp;
  const c = fp.counts;
  console.log(`  ×${g.instances.length}\tL=${c.lines} C=${c.circles} A=${c.arcs} P=${c.polys}\tbbox=${fp.bbox.w}×${fp.bbox.h}\tasp=${fp.aspect}\tsig=${fp.sig.slice(0,80)}`);
}

// Distribución
const hist = {};
for (const g of sorted) hist[g.instances.length] = (hist[g.instances.length] || 0) + 1;
console.log('\nDistribución de patrones por nº de instancias:');
for (const [n, count] of Object.entries(hist).sort((a,b)=>parseInt(b[0])-parseInt(a[0]))) {
  console.log(`  ${n} instancia(s): ${count} patrón(es)`);
}
