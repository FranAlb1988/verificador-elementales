// Orquestador: a partir de un DXF parseado, extrae patrones de símbolos
// agrupados por firma. Devuelve la información lista para la UI de tagging.

import { clusterSymbols } from './cluster.js';
import { groupByFingerprint, fingerprint } from './fingerprint.js';

export function extractPatterns(dxfData, opts = {}) {
  const clusters = clusterSymbols(dxfData.entities, { eps: opts.eps ?? 4 });
  const groups = groupByFingerprint(clusters);
  // Devolver como array ordenado por nº de instancias (descendente)
  const patterns = [...groups.values()]
    .map(g => ({
      sig: g.fp.sig,
      fp: g.fp,
      count: g.instances.length,
      representative: g.instances[0].cluster,
      instances: g.instances,
    }))
    .sort((a, b) => b.count - a.count);
  return { patterns, totalClusters: clusters.length };
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
