// Low-poly animated people (illustrative only — not real employees or live activity).
// Each body part is one InstancedMesh shared by every person; poses are driven by simple
// forward kinematics each frame: seated typing, standing conversation and walking loops.
import * as THREE from 'three';

const L = { thigh: 0.42, shin: 0.44, upper: 0.3, fore: 0.28, torso: 0.56, shoulder: 0.19, hipW: 0.1 };

function limb(len, r) { const g = new THREE.CapsuleGeometry(r, len - 2 * r, 3, 8); g.translate(0, -len / 2, 0); return g; }

export class Crowd {
  constructor(s, parent) {
    this.s = s; this.parent = parent; this.people = [];
    this.skin = ['#c69873', '#a87a58', '#d9ad8a', '#8d6446'];
    this.hair = ['#1f1814', '#3a2a20', '#2a211c', '#5a4030'];
  }
  add(p) { this.people.push({ phase: Math.random() * 6.28, speed: 1, ...p }); return this; }

  build() {
    const n = this.people.length; if (!n) return;
    const s = this.s, m = s.mats;
    const mk = (geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, n); im.castShadow = true; im.frustumCulled = false; this.parent.add(im); return im; };
    const torsoG = new THREE.CapsuleGeometry(0.17, 0.3, 4, 10); torsoG.scale(1, 1, 0.72); torsoG.translate(0, 0.3, 0);
    const pelvisG = new THREE.CapsuleGeometry(0.15, 0.06, 3, 8); pelvisG.scale(1.05, 1, 0.75);
    this.parts = {
      torso: mk(torsoG, m.cloth), pelvis: mk(pelvisG, m.pants),
      head: mk(new THREE.SphereGeometry(0.15, 14, 10), m.skinI),
      hair: mk(new THREE.SphereGeometry(0.156, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m.hairI),
      thighL: mk(limb(L.thigh, 0.075), m.pants), thighR: mk(limb(L.thigh, 0.075), m.pants),
      shinL: mk(limb(L.shin, 0.065), m.pants), shinR: mk(limb(L.shin, 0.065), m.pants),
      upL: mk(limb(L.upper, 0.055), m.cloth), upR: mk(limb(L.upper, 0.055), m.cloth),
      foL: mk(limb(L.fore, 0.048), m.skinI), foR: mk(limb(L.fore, 0.048), m.skinI),
      shoeL: mk(new THREE.BoxGeometry(0.11, 0.07, 0.22).translate(0, -0.03, 0.05), m.shoe), shoeR: mk(new THREE.BoxGeometry(0.11, 0.07, 0.22).translate(0, -0.03, 0.05), m.shoe)
    };
    const c = new THREE.Color();
    this.people.forEach((p, i) => {
      c.set(p.shirt || '#eef2f6'); this.parts.torso.setColorAt(i, c); this.parts.upL.setColorAt(i, c); this.parts.upR.setColorAt(i, c);
      c.set(p.pants || '#2d3442'); for (const k of ['pelvis', 'thighL', 'thighR', 'shinL', 'shinR']) this.parts[k].setColorAt(i, c);
      c.set(this.skin[i % 4]); this.parts.head.setColorAt(i, c); this.parts.foL.setColorAt(i, c); this.parts.foR.setColorAt(i, c);
      c.set(this.hair[(i * 7) % 4]); this.parts.hair.setColorAt(i, c);
    });
    this._tmp = { P: new THREE.Matrix4(), M: new THREE.Matrix4(), R: new THREE.Matrix4(), T: new THREE.Matrix4(), v: new THREE.Vector3() };
    this.update(0, 0, true);
    s.updaters.push((t, dt) => this.update(t, dt));
  }

  // place a limb chain: joint at local position j, absolute swing angle a (forward positive)
  _limb(im, i, P, jx, jy, jz, a, yaw2 = 0) {
    const { M, R, T } = this._tmp;
    T.makeTranslation(jx, jy, jz); R.makeRotationX(-a); M.multiplyMatrices(P, T).multiply(R);
    if (yaw2) M.multiply(new THREE.Matrix4().makeRotationZ(yaw2));
    im.setMatrixAt(i, M);
  }

  update(t, dt, force = false) {
    const s = this.s;
    if (!force && s.reduced) return;
    // adaptive: animate every frame on high quality, every other frame on low
    this._f = (this._f || 0) + 1;
    if (!force && s.quality === 'low' && this._f % 2) return;
    const { P, M, T, R } = this._tmp, parts = this.parts;
    this.people.forEach((p, i) => {
      let x = p.x, z = p.z, yaw = p.yaw || 0, hipY = 0.88, hip = [0, 0], knee = [0, 0], sh = [0, 0], el = [0.15, 0.15], lean = 0, headYaw = 0, bob = 0;
      const ph = t * p.speed + p.phase;
      if (p.pose === 'sit') {
        hipY = 0.6; hip = [1.5, 1.5]; knee = [1.5, 1.5]; lean = 0.12;
        const typing = Math.sin(ph * 2.2) > -0.4; // pauses now and then
        const k = typing ? 1 : 0.2;
        sh = [0.75 + Math.sin(ph * 13) * 0.05 * k, 0.75 + Math.sin(ph * 13 + 1.7) * 0.05 * k];
        el = [1.35 + Math.sin(ph * 17) * 0.12 * k, 1.35 + Math.sin(ph * 17 + 2.1) * 0.12 * k];
        headYaw = Math.sin(ph * 0.4) * 0.25;
      } else if (p.pose === 'talk') {
        sh = [0.2 + Math.max(0, Math.sin(ph * 1.6)) * 0.7, 0.12]; el = [0.6 + Math.max(0, Math.sin(ph * 1.6)) * 0.6, 0.25];
        headYaw = Math.sin(ph * 0.7) * 0.3; bob = Math.sin(ph * 1.6) * 0.01;
      } else if (p.pose === 'walk' && p.path) {
        const path = p.path, len = p.len || (p.len = pathLen(path));
        const d = ((t * 0.9 * p.speed + p.phase * 3) % len + len) % len;
        const [px, pz, dx, dz] = pointOnPath(path, d);
        x = px; z = pz; yaw = Math.atan2(dx, dz);
        const w = Math.sin(t * 6.5 * p.speed + p.phase);
        hip = [w * 0.42, -w * 0.42]; knee = [Math.max(0, -w) * 0.7, Math.max(0, w) * 0.7];
        sh = [-w * 0.35, w * 0.35]; el = [0.3, 0.3]; bob = Math.abs(Math.cos(t * 6.5 * p.speed + p.phase)) * 0.04;
      }
      P.makeTranslation(x, (p.y || 0) + bob, z).multiply(R.makeRotationY(yaw));
      // pelvis + torso
      T.makeTranslation(0, hipY, 0); M.multiplyMatrices(P, T); parts.pelvis.setMatrixAt(i, M);
      M.multiplyMatrices(P, T).multiply(R.makeRotationX(lean)); parts.torso.setMatrixAt(i, M);
      const shY = hipY + L.torso * Math.cos(lean), shZ = L.torso * Math.sin(lean);
      M.multiplyMatrices(P, T.makeTranslation(0, shY + 0.2, shZ + 0.02)).multiply(R.makeRotationY(headYaw)); parts.head.setMatrixAt(i, M);
      M.multiplyMatrices(P, T.makeTranslation(0, shY + 0.215, shZ)).multiply(R.makeRotationY(headYaw)); parts.hair.setMatrixAt(i, M);
      // legs
      for (const [side, sx] of [[0, -L.hipW], [1, L.hipW]]) {
        const a = hip[side], kn = a - knee[side];
        this._limb(side ? parts.thighR : parts.thighL, i, P, sx, hipY, 0, a);
        const kx = sx, ky = hipY - Math.cos(a) * L.thigh, kz = Math.sin(a) * L.thigh;
        this._limb(side ? parts.shinR : parts.shinL, i, P, kx, ky, kz, kn);
        const fy = ky - Math.cos(kn) * L.shin, fz = kz + Math.sin(kn) * L.shin;
        M.multiplyMatrices(P, T.makeTranslation(kx, fy, fz)); (side ? parts.shoeR : parts.shoeL).setMatrixAt(i, M);
      }
      // arms
      for (const [side, sx] of [[0, -L.shoulder], [1, L.shoulder]]) {
        const a = sh[side], fa = a + el[side];
        this._limb(side ? parts.upR : parts.upL, i, P, sx, shY - 0.04, shZ, a);
        const ey = shY - 0.04 - Math.cos(a) * L.upper, ez = shZ + Math.sin(a) * L.upper;
        this._limb(side ? parts.foR : parts.foL, i, P, sx, ey, ez, fa);
      }
    });
    for (const im of Object.values(parts)) im.instanceMatrix.needsUpdate = true;
  }
}

function pathLen(path) { let l = 0; for (let i = 0; i < path.length; i++) { const a = path[i], b = path[(i + 1) % path.length]; l += Math.hypot(b[0] - a[0], b[1] - a[1]); } return l; }
function pointOnPath(path, d) {
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= l) { const k = d / l; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, (b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
    d -= l;
  }
  return [path[0][0], path[0][1], 0, 1];
}
