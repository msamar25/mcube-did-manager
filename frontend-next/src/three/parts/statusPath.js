// Replacement-flow status path (replaces the old conveyor belt).
// A flush glass walkway with glowing edges, four glass status pads (Pending → Processing →
// Completed / Failed) with light rings and floating screens, and small floating request cards that
// glide along the path. Cards are ILLUSTRATIVE motion only; the pad labels show the real flow counts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ribbon, offsetCurve } from '../geometry.js';

export const STATUS = [
  { key: 'pending', label: 'Pending', color: '#f5a524' },
  { key: 'processing', label: 'Processing', color: '#3b82f6' },
  { key: 'completed', label: 'Completed', color: '#22c55e' },
  { key: 'failed', label: 'Failed', color: '#ef4444' }
];
const f = (v) => (v === undefined || v === null ? '—' : Number(v).toLocaleString('en-IN'));

export function buildStatusPath(s, ptsIn) {
  const pts = ptsIn.map(([a, b]) => new THREE.Vector3(a, 0, b));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const m = s.mats, Y = 0.06;

  // walkway: pale glass strip flush with the floor, edged with orange light
  const walk = new THREE.MeshPhysicalMaterial({ color: '#f3f6fa', roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.85 });
  s.scene.add(s._shadow(new THREE.Mesh(ribbon(curve, 2.6, Y, 160), walk), false, true));
  const edges = [-1.35, 1.35].map((off) => new THREE.TubeGeometry(offsetCurve(curve, off, 0, 90), 160, 0.05, 6).translate(0, Y + 0.03, 0));
  s.scene.add(new THREE.Mesh(mergeGeometries(edges), s.glow('#ff8a3d', 2.4)));
  // centre dashes
  const dash = [];
  for (let k = 0; k < 40; k++) { const t = (k + 0.5) / 40, p = curve.getPointAt(t), tan = curve.getTangentAt(t); const b = new THREE.BoxGeometry(0.42, 0.02, 0.07); b.rotateY(-Math.atan2(tan.z, tan.x)); b.translate(p.x, Y + 0.02, p.z); dash.push(b); }
  const dashMat = s.glow('#ffd2ad', 1.4); s.scene.add(new THREE.Mesh(mergeGeometries(dash), dashMat));

  // status pads
  s.gates = [];
  const gateT = [0.12, 0.38, 0.64, 0.9];
  const padGlass = new THREE.MeshPhysicalMaterial({ color: '#e8f0fa', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.45, clearcoat: 1, envMapIntensity: 2, depthWrite: false });
  STATUS.forEach((st, i) => {
    const t = gateT[i], p = curve.getPointAt(t);
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    g.add(s._shadow(new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.9, 0.22, 48).translate(0, 0.11, 0), m.metal)));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.1, 48).translate(0, 0.27, 0), padGlass));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.68, 0.06, 6, 64), s.glow(st.color, 2.8)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.24; g.add(ring);
    // slim post + floating status screen facing the camera side (+z)
    g.add(s._shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 10).translate(0, 1.3, -1.1), m.metal)));
    const scr = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.95, 0.08, 3, 0.06), m.metalDark); scr.position.set(0, 2.45, -1.1); g.add(scr);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), s.glow(st.color, 1.8)); face.position.set(0, 2.45, -1.05); g.add(face);
    s.scene.add(g);
    const div = s.labels?.add(g, [0, 3.5, -1.1], `<b>${st.label}</b><span data-k="${st.key}">${f(s.data?.flow?.[st.key])}</span>`, { cls: 'cc-gate', priority: 30 + i, onClick: () => s.onSelect({ type: 'flow', key: st.key }) });
    div?.style.setProperty('--c', st.color);
    s.gates.push({ st, div, ring });
  });
  const mid = curve.getPointAt(0.5);
  s.flowLabel = s.labels?.add(s.scene, [mid.x, 0.4, mid.z + 3.2], `<span class="cc-ico cc-orange"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg></span><b>Replacement Flow</b>`, { cls: 'cc-flow', priority: 40, onClick: () => s.onSelect({ type: 'flow' }) });

  // floating request cards (instanced, thin rounded tiles that hover and bob)
  const N = 12;
  const cards = new THREE.InstancedMesh(new RoundedBoxGeometry(0.9, 0.6, 0.06, 2, 0.05), new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1, emissive: '#ffffff', emissiveIntensity: 0.35 }), N);
  cards.castShadow = true; s.scene.add(cards);
  const colors = STATUS.map((x) => new THREE.Color(x.color));
  const o = new THREE.Object3D();
  s.updaters.push((t) => {
    for (let k = 0; k < N; k++) {
      const u = ((((k + 0.5) / N + t * 0.02) % 1) + 1) % 1;
      const p = curve.getPointAt(u), tan = curve.getTangentAt(u);
      o.position.set(p.x, 1.25 + Math.sin(t * 2 + k) * 0.12, p.z);
      o.rotation.set(-0.35, -Math.atan2(tan.z, tan.x) + Math.PI / 2, 0); o.updateMatrix(); cards.setMatrixAt(k, o.matrix);
      const zone = u < gateT[1] ? 0 : u < gateT[2] ? 1 : u < gateT[3] - 0.08 ? 2 : k % 4 === 0 ? 3 : 2;
      cards.setColorAt(k, colors[zone]);
    }
    cards.instanceMatrix.needsUpdate = true; if (cards.instanceColor) cards.instanceColor.needsUpdate = true;
    for (let i = 0; i < s.gates.length; i++) { const r = s.gates[i].ring; if (r) r.scale.setScalar(1 + Math.max(0, Math.sin(t * 1.6 - i * 1.2)) * 0.04); }
  });
  const hit = new THREE.Mesh(ribbon(curve, 5, 1.5, 40), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  hit.userData = { type: 'flow' }; s.scene.add(hit); s.hitTargets.push(hit);
  s.flowCurve = curve;
}
