// Geometry helpers: façade boxes with window-scaled UVs, ribbons and offset curves.
import * as THREE from 'three';

export const CELL_W = 1.15; // world units per window column
export const CELL_H = 0.95; // world units per floor
const GRID = 8;             // windows per texture tile

// Box whose side-face UVs tile the 8x8 façade texture at real window size.
// Roof faces map to the clean corner patch of the texture.
export function facadeBox(w, h, d, x, y, z, seed = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const ox = (seed % GRID) / GRID, oy = (Math.floor(seed / GRID) % GRID) / GRID;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(i, 0.004, 0.004); continue; }
      const faceW = f < 2 ? d : w;
      uv.setXY(i, uv.getX(i) * (faceW / CELL_W / GRID) + ox, uv.getY(i) * (h / CELL_H / GRID) + oy);
    }
  }
  g.translate(x, y + h / 2, z);
  return g;
}

export function plainBox(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return g;
}

// Flat strip that follows a curve in the XZ plane. u runs along length (in world units / uScale).
export function ribbon(curve, width, y = 0, segments = 96, uScale = 1, offset = 0) {
  const pos = [], uv = [], idx = [], nrm = [];
  const len = curve.getLength();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const a = p.clone().addScaledVector(n, offset + width / 2);
    const b = p.clone().addScaledVector(n, offset - width / 2);
    pos.push(a.x, y + p.y, a.z, b.x, y + p.y, b.z);
    nrm.push(0, 1, 0, 0, 1, 0);
    const u = (t * len) / uScale;
    uv.push(u, 1, u, 0);
    if (i < segments) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); } // counter-clockwise from above → faces up
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function offsetCurve(curve, offset, y = 0, samples = 60) {
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    pts.push(new THREE.Vector3(p.x + n.x * offset, p.y + y, p.z + n.z * offset));
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}
