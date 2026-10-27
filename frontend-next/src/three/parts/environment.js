// Ground (reflective on high quality), distant skyline, trees, street lamps and lights.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { floorTexture } from '../textures.js';
import { rng } from '../geometry.js';

export function buildLights(s) {
  const c = s.clay, L = s.L;
  s.scene.add(new THREE.HemisphereLight('#ffffff', c ? '#cfd8e6' : '#aab3c2', (c ? 1.35 : 1.0) * L));
  const sun = new THREE.DirectionalLight(c ? '#ffffff' : '#ffeed8', (c ? 2.1 : 2.7) * L);
  sun.position.set(-34, 62, 40);
  sun.castShadow = true;
  const sm = s.quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 40, bottom: -40, near: 20, far: 150 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.035; sun.shadow.radius = 3;
  s.scene.add(sun);
  // cool rim light from behind for silhouette separation
  const rim = new THREE.DirectionalLight('#c9dbff', 0.9 * L);
  rim.position.set(30, 40, -60); s.scene.add(rim);
}

export function buildGround(s, w, h) {
  const tex = floorTexture(s.clay);
  if (s.quality === 'high' && !s.clay && !new URLSearchParams(location.search).has('noref')) {
    const pr = s.renderer.getPixelRatio();
    const mirror = new Reflector(new THREE.CircleGeometry(170, 96), {
      clipBias: 0.003, textureWidth: Math.round(w * pr * 0.5), textureHeight: Math.round(h * pr * 0.5), color: 0x7d848f
    });
    mirror.rotation.x = -Math.PI / 2;
    // keep overlay planes out of their own reflection
    const orig = mirror.onBeforeRender.bind(mirror);
    mirror.onBeforeRender = (...a) => { for (const o of s.noReflect) o.visible = false; orig(...a); for (const o of s.noReflect) o.visible = true; };
    s.scene.add(mirror);
    s.mirror = mirror;
    const over = new THREE.Mesh(new THREE.CircleGeometry(170, 96), new THREE.MeshStandardMaterial({ map: tex, color: '#e4e7ec', roughness: 0.6, metalness: 0.05, transparent: true, opacity: 0.82, depthWrite: false }));
    over.rotation.x = -Math.PI / 2; over.position.y = 0.012; over.receiveShadow = true; over.renderOrder = 0;
    s.scene.add(over); s.noReflect.push(over);
  } else {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(170, 96), new THREE.MeshStandardMaterial({ map: tex, roughness: s.clay ? 0.9 : 0.45, metalness: s.clay ? 0 : 0.1 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    s.scene.add(floor);
  }
}

export function buildSkyline(s) {
  const r = rng(42);
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: s.clay ? '#e4ecf7' : '#e1e4e9', roughness: 0.9, metalness: 0.05 });
  const count = s.quality === 'low' ? 80 : 150;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0, guard = 0;
  while (n < count && guard++ < 5000) {
    const a = r() * Math.PI * 2, rad = 84 + r() * 60;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (z > 10) continue; // keep the camera side open
    const hgt = 5 + Math.pow(r(), 1.4) * 34;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.round(r() * 4) * (Math.PI / 2) + a);
    sc.set(3 + r() * 4, hgt, 3 + r() * 4); p.set(x, 0, z);
    mesh.setMatrixAt(n++, m.compose(p, q, sc));
  }
  mesh.count = n;
  s.scene.add(mesh);
}

export function buildTrees(s, blockers, linkEnds) {
  const r = rng(9);
  let tries = 0, added = 0;
  const want = s.quality === 'low' ? 55 : 110;
  while (added < want && tries++ < 5000) {
    const x = (r() - 0.5) * 104, z = (r() - 0.5) * 76;
    if (blockers.some(([bx, bz, br]) => Math.hypot(x - bx, z - bz) < br)) continue;
    if (linkEnds.some(([ax, az]) => segDist(x, z, ax, az, 0, 0) < 3)) continue;
    s.trees.push([x, 0, z, 0.6 + r() * 0.55]); added++;
  }
  const n = s.trees.length;
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const trunk = new THREE.CylinderGeometry(0.09, 0.15, 1.2, 6);
  const parts = [0, 1, 2].map(() => s._shadow(new THREE.InstancedMesh(blob, s.mats.foliage, n), true, false));
  const tr = s._shadow(new THREE.InstancedMesh(trunk, s.mats.trunk, n), true, false);
  const o = new THREE.Object3D();
  const greens = s.clay ? ['#dbe7dc', '#e6eee4', '#d1dfd2'] : ['#5c9b47', '#4a873c', '#71ad55', '#3d7634', '#83b960'];
  s.trees.forEach(([x, y, z, sc], i) => {
    o.rotation.set(0, i, 0);
    o.position.set(x, y + 0.6 * sc, z); o.scale.setScalar(sc); o.updateMatrix(); tr.setMatrixAt(i, o.matrix);
    const offs = [[0, 1.6, 0, 1.0, 1.15], [0.45, 2.35, 0.2, 0.72, 0.8], [-0.35, 2.55, -0.25, 0.62, 0.7]];
    offs.forEach(([dx, dy, dz, s1, s2], k) => {
      o.position.set(x + dx * sc, y + dy * sc, z + dz * sc); o.scale.set(s1 * sc, s2 * sc, s1 * sc); o.updateMatrix();
      parts[k].setMatrixAt(i, o.matrix);
      const c = new THREE.Color(greens[(i + k) % greens.length]).offsetHSL(0, 0, k * 0.03);
      parts[k].setColorAt(i, c);
    });
  });
  s.scene.add(tr, ...parts);
}

// Small lamp posts with glowing heads (instanced).
export function buildLamps(s) {
  if (!s.lamps.length) return;
  const n = s.lamps.length;
  const pole = s._shadow(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 6), s.mats.metalDark, n), true, false);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 10, 8), s.glow('#ffd9a0', 2.4), n);
  const o = new THREE.Object3D();
  s.lamps.forEach(([x, y, z], i) => {
    o.position.set(x, y + 0.8, z); o.updateMatrix(); pole.setMatrixAt(i, o.matrix);
    o.position.set(x, y + 1.65, z); o.updateMatrix(); head.setMatrixAt(i, o.matrix);
  });
  s.scene.add(pole, head);
}

export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

// Potted office plants (instanced).
export function buildPlants(s, spots) {
  const n = spots.length; if (!n) return;
  const pot = s._shadow(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.42, 0.9, 16), s.mats.pot, n));
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const leaves = [0, 1, 2].map(() => s._shadow(new THREE.InstancedMesh(blob, s.mats.foliage, n), true, false));
  const o = new THREE.Object3D();
  const greens = s.clay ? ['#dbe7dc', '#e6eee4'] : ['#4f9a45', '#3f8a3a', '#62ad52'];
  spots.forEach(([x, z], i) => {
    o.rotation.set(0, i, 0); o.scale.setScalar(1);
    o.position.set(x, 0.45, z); o.updateMatrix(); pot.setMatrixAt(i, o.matrix);
    [[0, 1.5, 0, 0.75], [0.35, 2.15, 0.15, 0.55], [-0.3, 2.3, -0.2, 0.5]].forEach(([dx, dy, dz, sc], k) => {
      o.position.set(x + dx, dy, z + dz); o.scale.set(sc, sc * 1.15, sc); o.updateMatrix(); leaves[k].setMatrixAt(i, o.matrix);
      leaves[k].setColorAt(i, new THREE.Color(greens[(i + k) % greens.length]));
    });
  });
  s.scene.add(pot, ...leaves);
}
