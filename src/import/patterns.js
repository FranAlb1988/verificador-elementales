// Orquestador: a partir de un DXF parseado, extrae patrones de símbolos
// agrupados por firma. Devuelve la información lista para la UI de tagging.

import { clusterSymbols } from './cluster.js';
import { groupByFingerprint, fingerprint } from './fingerprint.js';
import { isAnsiCode } from './ansi.js';

export function extractPatterns(dxfData, opts = {}) {
  const clusters = clusterSymbols(dxfData.entities, { eps: opts.eps ?? 4 });
  const groups = groupByFingerprint(clusters);
  const patterns = [...groups.values()]
    .map(g => ({
      sig: g.fp.sig,
      fp: g.fp,
      count: g.instances.length,
      representative: g.instances[0].cluster,
      instances: g.instances,
      suggestion: suggestTagFor(g.fp, g.instances[0].cluster, dxfData.entities),
    }))
    .sort((a, b) => b.count - a.count);
  return { patterns, totalClusters: clusters.length };
}

// Heurística: sugerir un tag value (de TAG_OPTIONS) basado en la firma y la
// geometría real del cluster. Devuelve null si no hay certeza.
export function suggestTagFor(fp, cluster, allEntities) {
  const { counts, bbox } = fp;
  const w = bbox.w, h = bbox.h;
  const square = w > 0 && h > 0 && Math.abs(w - h) <= 1;

  // ---- TERMINALES (Lámina 606) ----
  // Cuadrado pequeño (3-6 unidades) formado SOLO por polilíneas (caja), con o
  // sin un círculo marcador adentro. El círculo indica relleno/marcador (CCM);
  // sin círculo = vacío (CAMPO).
  const exactSquare = w > 0 && h > 0 && Math.abs(w - h) <= 0.5;
  if (exactSquare && w >= 3 && w <= 6
      && counts.lines === 0 && counts.arcs === 0
      && counts.polys >= 1) {
    // Si además hay relleno (HATCH) dentro, eso refuerza CCM
    const filled = counts.circles >= 1 || hasFillInside(allEntities, bbox);
    return filled ? 'terminal-ccm' : 'terminal-campo';
  }

  // Rombo PLC: 4 líneas a 45° formando rombo cerrado
  if (counts.lines === 4 && counts.circles === 0 && counts.polys === 0 && w <= 6 && h <= 6) {
    const angs = lineAnglesOf(cluster);
    const diag45 = angs.filter(a => Math.abs(a - 45) < 8 || Math.abs(a - 135) < 8).length;
    if (diag45 >= 4) return 'terminal-plc';
  }

  // Triángulo VARIADOR: 3 LINEs cerradas (vértices conectan entre sí)
  if (counts.lines === 3 && counts.circles === 0 && counts.polys === 0
      && w <= 6 && h <= 6 && isClosedTriangle(cluster)) {
    return 'terminal-variador';
  }

  // ---- IED (Lámina 603): rectángulo grande con muchas líneas + 6 círculos pequeños ----
  if (counts.lines >= 15 && counts.circles >= 4 && Math.max(w, h) >= 8) {
    return 'ied';
  }

  // ---- MOTOR vs RELÉ PROTECCIÓN ANSI (Lámina 603, 605): círculo con código adentro ----
  if (counts.circles >= 1 && counts.polys === 0) {
    const bigCircle = cluster.find(it => it.entity.type === 'CIRCLE' && it.entity.radius >= 3);
    if (bigCircle) {
      const code = textInside(allEntities, bigCircle.entity.center, bigCircle.entity.radius * 1.2);
      if (code === 'M') return 'motor';
      // Códigos ANSI (numéricos con posibles letras N/G/P/A/BF): relé de protección
      if (isAnsiCode(code)) {
        return { value: 'protection-relay', props: { tag: code, ansi: code } };
      }
      // Letras simples: instrumentos (V, A, S)
      if (code && /^[VAS]$/.test(code)) {
        return { value: 'protection-relay', props: { tag: code, ansi: code } };
      }
    }
  }

  // ---- TIERRA: 3 líneas horizontales decrecientes + línea vertical ----
  // Heurística simple: 4 líneas, una vertical y tres horizontales paralelas
  if (counts.lines === 4 && counts.circles === 0) {
    const horiz = lineAnglesOf(cluster).filter(a => Math.abs(a) < 10 || Math.abs(a - 180) < 10).length;
    if (horiz >= 3) return 'ground';
  }

  // ---- Cluster solo círculo pequeño aislado → no sugiere (puede ser terminal marker) ----
  // El usuario decide.
  return null;
}

function hasFillInside(allEntities, bbox, pad = 0.5) {
  for (const e of allEntities) {
    if (e.type !== 'HATCH' && e.type !== 'SOLID') continue;
    let pts = [];
    if (e.points) pts = e.points;
    else if (e.boundaries) {
      for (const b of e.boundaries) if (Array.isArray(b)) pts.push(...b);
    } else if (e.seedPoints) pts = e.seedPoints;
    for (const p of pts) {
      if (!p) continue;
      if (p.x >= bbox.minX - pad && p.x <= bbox.maxX + pad &&
          p.y >= bbox.minY - pad && p.y <= bbox.maxY + pad) return true;
    }
  }
  return false;
}

function lineAnglesOf(cluster) {
  const out = [];
  for (const it of cluster) {
    const e = it.entity;
    if (e.type !== 'LINE') continue;
    const a = e.vertices[0], b = e.vertices[1];
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 360) % 180;
    out.push(ang);
  }
  return out;
}

function ptInBbox(p, bbox, pad = 0) {
  if (!p) return false;
  return p.x >= bbox.minX - pad && p.x <= bbox.maxX + pad &&
         p.y >= bbox.minY - pad && p.y <= bbox.maxY + pad;
}

// Busca el texto más cercano al centro dado (dentro de maxDist).
// Devuelve el texto trim'eado o null.
function textInside(allEntities, center, maxDist) {
  let best = null, bestD = maxDist;
  for (const e of allEntities) {
    if (e.type !== 'TEXT' && e.type !== 'MTEXT') continue;
    const p = e.position || e.startPoint;
    if (!p) continue;
    const txt = (e.text || e.string || '').replace(/\\[A-Z][^;]*;/g, '').trim();
    if (!txt) continue;
    const d = Math.hypot(p.x - center.x, p.y - center.y);
    if (d < bestD) { bestD = d; best = txt; }
  }
  return best;
}

// Detecta si 3 LINEs forman un triángulo cerrado (cada vértice conecta a otro).
function isClosedTriangle(cluster) {
  const lines = cluster.filter(it => it.entity.type === 'LINE');
  if (lines.length !== 3) return false;
  const eps = 0.5;
  const pts = [];
  for (const it of lines) {
    pts.push(it.entity.vertices[0], it.entity.vertices[1]);
  }
  // Cada uno de los 6 endpoints debe coincidir con exactamente otro (3 vértices).
  let matched = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d <= eps) { matched++; break; }
    }
  }
  return matched >= 3;
}

// localStorage key
const STORAGE_KEY = 'verificador-elementales:tagAssignments';

export function loadSavedTags() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveTags(assignments) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  } catch {}
}
