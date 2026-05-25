// Orquestador: a partir de un DXF parseado, extrae patrones de símbolos
// agrupados por firma. Devuelve la información lista para la UI de tagging.

import { clusterSymbols } from './cluster.js';
import { groupByFingerprint, fingerprint } from './fingerprint.js';
import { isAnsiCode } from './ansi.js';
import { decomposeCluster, reconstructKps } from './subPatterns.js';

export function extractPatterns(dxfData, opts = {}) {
  const macroClusters = clusterSymbols(dxfData.entities, { eps: opts.eps ?? 4 });

  // Decomposición: para cada macro-cluster grande, buscar sub-patrones (contactos
  // NO/NC, bobinas) que quedaron unidos por compartir coords con vecinos.
  const allClusters = [];
  const subTypeHints = new Map(); // signature → tipo sugerido por sub-decomposición
  for (const mc of macroClusters) {
    const { subs, leftover } = decomposeCluster(mc);
    for (const sub of subs) {
      const subCluster = reconstructKps(sub.items);
      allClusters.push(subCluster);
      const fp = fingerprint(subCluster);
      subTypeHints.set(fp.sig, sub.type);
    }
    if (leftover.length > 0) allClusters.push(leftover);
  }

  const groups = groupByFingerprint(allClusters);
  const patterns = [...groups.values()]
    .map(g => {
      // Sugerencia: primero la del sub-patrón (si lo es), si no la heurística normal.
      const subHint = subTypeHints.get(g.fp.sig);
      const suggestion = subHint || suggestTagFor(g.fp, g.instances[0].cluster, dxfData.entities);
      return {
        sig: g.fp.sig,
        fp: g.fp,
        count: g.instances.length,
        representative: g.instances[0].cluster,
        instances: g.instances,
        suggestion,
      };
    })
    .sort((a, b) => b.count - a.count);
  return { patterns, totalClusters: allClusters.length };
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
      if (isAnsiCode(code)) {
        return { value: 'protection-relay', props: { tag: code, ansi: code } };
      }
      if (code && /^[VAS]$/.test(code)) {
        return { value: 'protection-relay', props: { tag: code, ansi: code } };
      }
    }
  }

  // ---- LUZ PILOTO (Lámina 605): círculo + 1 arco ----
  // El símbolo "Ø" (círculo con línea/arco interior) es típico de luz piloto.
  if (counts.circles === 1 && counts.arcs === 1 && counts.lines === 0 && counts.polys === 0) {
    const ctr = cluster.find(it => it.entity.type === 'CIRCLE')?.entity.center;
    if (ctr) {
      const txt = textInside(allEntities, ctr, 8);
      // Detectar color por letra (R/V/AM/B/A) cerca del símbolo
      const color = txt === 'R' ? 'red'
                  : txt === 'V' ? 'green'
                  : txt === 'AM' ? 'yellow'
                  : txt === 'B' ? 'white'
                  : txt === 'A' ? 'blue' : 'green';
      return { value: 'lamp', props: { color, label: txt || 'L' } };
    }
    return 'lamp';
  }

  // ---- BOBINA CONTACTOR (Lámina 605): círculo r=2-4 con 0-2 líneas verticales (leads) ----
  if (counts.circles === 1 && counts.arcs === 0 && counts.polys === 0
      && counts.lines >= 0 && counts.lines <= 2) {
    const cEnt = cluster.find(it => it.entity.type === 'CIRCLE')?.entity;
    if (cEnt && cEnt.radius >= 1.5 && cEnt.radius <= 4) {
      const insideText = textInside(allEntities, cEnt.center, cEnt.radius * 0.5);
      const lines = cluster.filter(it => it.entity.type === 'LINE');
      const allVertical = lines.every(it => {
        const a = it.entity.vertices[0], b = it.entity.vertices[1];
        return Math.abs(a.x - b.x) < 0.5;
      });
      if (!insideText && allVertical) {
        const tag = nearbyShortText(allEntities, cEnt.center, cEnt.radius * 4);
        return { value: 'coil', props: { tag: tag || 'K?' } };
      }
    }
  }

  // ---- CONTACTO NO (Lámina 604): 3 líneas — 2 verticales + 1 diagonal ----
  if (counts.lines === 3 && counts.circles === 0 && counts.arcs === 0 && counts.polys === 0
      && w <= 4 && h >= 3 && h <= 10) {
    const lines = cluster.map(it => it.entity);
    const vert = lines.filter(l => Math.abs(l.vertices[0].x - l.vertices[1].x) < 0.5).length;
    const diag = lines.filter(l => {
      const dx = Math.abs(l.vertices[0].x - l.vertices[1].x);
      const dy = Math.abs(l.vertices[0].y - l.vertices[1].y);
      return dx > 0.3 && dy > 0.3;
    }).length;
    if (vert === 2 && diag === 1) {
      const ctr = { x: (bbox.minX + bbox.maxX)/2, y: (bbox.minY + bbox.maxY)/2 };
      const tag = nearbyShortText(allEntities, ctr, 6);
      return { value: 'contact-no', props: { tag: tag || 'K?' } };
    }
  }

  // ---- CONTACTO NC (Lámina 604): 4 líneas — 2 verticales + 1 diagonal + 1 barra horizontal ----
  if (counts.lines === 4 && counts.circles === 0 && counts.arcs === 0 && counts.polys === 0
      && w <= 5 && h >= 3 && h <= 10) {
    const lines = cluster.map(it => it.entity);
    const vert = lines.filter(l => Math.abs(l.vertices[0].x - l.vertices[1].x) < 0.5).length;
    const horiz = lines.filter(l => Math.abs(l.vertices[0].y - l.vertices[1].y) < 0.5).length;
    const diag = lines.filter(l => {
      const dx = Math.abs(l.vertices[0].x - l.vertices[1].x);
      const dy = Math.abs(l.vertices[0].y - l.vertices[1].y);
      return dx > 0.3 && dy > 0.3;
    }).length;
    if (vert === 2 && horiz >= 1 && diag >= 1) {
      const ctr = { x: (bbox.minX + bbox.maxX)/2, y: (bbox.minY + bbox.maxY)/2 };
      const tag = nearbyShortText(allEntities, ctr, 6);
      return { value: 'contact-nc', props: { tag: tag || 'K?' } };
    }
  }

  // ---- BOTONERA con flag chevron (Lámina 604): 2 polilíneas formando flecha ----
  // Patrón observado: P=2 con largo similar, bbox ~3-5 unidades, sin líneas ni círculos
  if (counts.polys === 2 && counts.lines === 0 && counts.circles === 0 && counts.arcs === 0
      && w <= 6 && h <= 6) {
    // Por defecto sugerir pulsador NO; el usuario puede cambiarlo si es NC
    return 'pushbutton-no';
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

// Como textInside, pero excluye textos largos (notas/descripciones) — útil para
// extraer tags cortos (M, RX, K1, FU1, etc.) cerca de un símbolo.
function nearbyShortText(allEntities, center, maxDist) {
  let best = null, bestD = maxDist;
  for (const e of allEntities) {
    if (e.type !== 'TEXT' && e.type !== 'MTEXT') continue;
    const p = e.position || e.startPoint;
    if (!p) continue;
    const txt = (e.text || e.string || '').replace(/\\[A-Z][^;]*;/g, '').trim();
    if (!txt || txt.length > 6) continue;
    if (!/^[A-Z0-9\/\-]+$/i.test(txt)) continue;
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
