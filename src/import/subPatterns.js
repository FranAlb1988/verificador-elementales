// Decomposición de macro-clusters en sub-patrones.
//
// El clustering espacial une entidades por proximidad. Componentes en serie
// (típico en elementales: estop → parar → partir → bobina) comparten coords
// exactas en sus extremos, por lo que el clustering los une en un macro-cluster
// gigante. Acá identificamos sub-patrones específicos dentro de ese cluster
// para detectar bobinas y contactos NO/NC individuales.
//
// Devuelve: { subs: [{ type, items: [{entity,...}] }], leftover: [items no usados] }

export function decomposeCluster(cluster) {
  // Decomposemos clusters de 3+ entidades. Los más chicos suelen ser símbolos
  // simples (bornes, junctions) que ya detectan las heurísticas existentes.
  if (cluster.length < 3) return { subs: [], leftover: cluster };

  const used = new Set();
  const subs = [];

  // Convertir a array indexado
  const items = cluster.map((c, i) => ({ ...c, idx: i }));

  // 1) Contactos NC (4 líneas: 2 vert + 1 diag + 1 barra horizontal)
  //    Detectar PRIMERO porque incluye a contact-no como subconjunto + barra.
  for (const sub of findContacts(items, used, /*withBar=*/true)) {
    subs.push(sub);
  }

  // 2) Contactos NO (3 líneas: 2 vert + 1 diag)
  for (const sub of findContacts(items, used, /*withBar=*/false)) {
    subs.push(sub);
  }

  // 3) Bobinas (CIRCLE r=2-4 aislado dentro del cluster)
  for (const it of items) {
    if (used.has(it.idx)) continue;
    if (it.entity.type !== 'CIRCLE') continue;
    const r = it.entity.radius;
    if (r >= 1.5 && r <= 4) {
      // verificar que no sea parte de un motor (3 círculos cercanos) o IED (muchos)
      // simple test: no más de 1 círculo en radio 5 alrededor
      const ctr = it.entity.center;
      const nearOtherCircles = items.filter(o =>
        o !== it && !used.has(o.idx) && o.entity.type === 'CIRCLE' &&
        Math.hypot(o.entity.center.x - ctr.x, o.entity.center.y - ctr.y) < 5
      ).length;
      if (nearOtherCircles <= 0) {
        subs.push({ type: 'coil', items: [it] });
        used.add(it.idx);
      }
    }
  }

  const leftover = items.filter(it => !used.has(it.idx));
  return { subs, leftover };
}

// Encuentra grupos de 3 líneas (2 verticales + 1 diagonal) o 4 líneas
// (las anteriores + barra horizontal) que forman un contacto NO o NC.
function findContacts(items, used, withBar) {
  const out = [];
  const lines = items.filter(it => it.entity.type === 'LINE');
  const isVert = (l) => Math.abs(l.vertices[0].x - l.vertices[1].x) < 0.5;
  const isHoriz = (l) => Math.abs(l.vertices[0].y - l.vertices[1].y) < 0.5;
  const isDiag = (l) => {
    const dx = Math.abs(l.vertices[0].x - l.vertices[1].x);
    const dy = Math.abs(l.vertices[0].y - l.vertices[1].y);
    return dx > 0.3 && dy > 0.3;
  };

  for (const dItem of lines) {
    if (used.has(dItem.idx)) continue;
    const dLine = dItem.entity;
    if (!isDiag(dLine)) continue;

    // Buscar vert que comparte un endpoint con dLine
    const v1 = findVertSharing(lines, used, dLine.vertices[0]);
    const v2 = findVertSharing(lines, used, dLine.vertices[1]);
    if (!v1 || !v2 || v1.idx === v2.idx) continue;

    // Verificar que los 2 verticales sean colineales en X aproximadamente
    const x1 = v1.entity.vertices[0].x;
    const x2 = v2.entity.vertices[0].x;
    if (Math.abs(x1 - x2) > 1.0) continue;

    // Verificar tamaño razonable
    const bb = bboxOf([dItem, v1, v2]);
    if (bb.w > 6 || bb.h > 12) continue;

    let comboItems = [dItem, v1, v2];

    if (withBar) {
      // Buscar una barra horizontal pequeña cerca del diagonal
      const bar = lines.find(l =>
        !used.has(l.idx) &&
        l.idx !== dItem.idx && l.idx !== v1.idx && l.idx !== v2.idx &&
        isHoriz(l.entity) &&
        Math.abs(l.entity.vertices[0].x - l.entity.vertices[1].x) >= 1 &&
        Math.abs(l.entity.vertices[0].x - l.entity.vertices[1].x) <= 4 &&
        // misma altura aprox que el diagonal
        Math.abs((l.entity.vertices[0].y + l.entity.vertices[1].y) / 2 -
                 (dLine.vertices[0].y + dLine.vertices[1].y) / 2) < 1.5
      );
      if (!bar) continue;
      comboItems.push(bar);
    }

    for (const it of comboItems) used.add(it.idx);
    out.push({
      type: withBar ? 'contact-nc' : 'contact-no',
      items: comboItems,
    });
  }
  return out;
}

function findVertSharing(lines, used, point, eps = 0.5) {
  for (const it of lines) {
    if (used.has(it.idx)) continue;
    const l = it.entity;
    if (Math.abs(l.vertices[0].x - l.vertices[1].x) >= 0.5) continue; // not vertical
    for (const v of l.vertices) {
      if (Math.hypot(v.x - point.x, v.y - point.y) <= eps) return it;
    }
  }
  return null;
}

function bboxOf(items) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const it of items) {
    const e = it.entity;
    if (e.type === 'LINE') {
      for (const v of e.vertices) {
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
    } else if (e.type === 'CIRCLE') {
      minX = Math.min(minX, e.center.x - e.radius);
      maxX = Math.max(maxX, e.center.x + e.radius);
      minY = Math.min(minY, e.center.y - e.radius);
      maxY = Math.max(maxY, e.center.y + e.radius);
    }
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// Reconstruir kps (keypoints) para que el sub-cluster sea compatible con el
// resto del pipeline (fingerprint usa el cluster como array de items con kps).
export function reconstructKps(items) {
  return items.map(it => {
    const e = it.entity;
    let kps = [];
    if (e.type === 'LINE') kps = [e.vertices[0], e.vertices[1]];
    else if (e.type === 'CIRCLE' || e.type === 'ARC') {
      const c = e.center, r = e.radius;
      kps = [c, {x:c.x+r,y:c.y}, {x:c.x-r,y:c.y}, {x:c.x,y:c.y+r}, {x:c.x,y:c.y-r}];
    } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') kps = e.vertices || [];
    return { ...it, kps };
  });
}
