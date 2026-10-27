// Login hero — "UNext Operations Lifeline".
// The admissions journey (Enquiry → Counsellor guidance → Application & documents → Payment & enrollment)
// runs around a central UNext L1 Support Hub. A 15-second ILLUSTRATIVE loop shows an orange pulse moving
// through the journey, an amber issue appearing, a ticket travelling to L1, a specialist resolving it,
// the indicator turning green and the journey continuing. No live data is represented.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Crowd } from './parts/people.js';
import { glowTexture, screenTexture } from './textures.js';

const LOOP = 15;
const NI = (g) => (g.index ? g.toNonIndexed() : g);
const merge = (a) => mergeGeometries(a.map(NI));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

const ZONES = [
  { key: 'enquiry', label: 'Student enquiry', pos: [-14, 0.5], color: '#5aa2ff' },
  { key: 'counsel', label: 'Counsellor guidance', pos: [-8, -9.5], color: '#5aa2ff' },
  { key: 'apply', label: 'Application & documents', pos: [2.5, -12.5], color: '#5aa2ff' },
  { key: 'pay', label: 'Payment & enrollment', pos: [12.5, -4.5], color: '#5aa2ff' }
];
const HUB = [0, 5];

export class LifelineScene {
  constructor(el, { onStep } = {}) {
    this.el = el; this.onStep = onStep || (() => {}); this.updaters = []; this.t = 0; this.fixed = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.quality = (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high';
    const w = el.clientWidth || 800, h = el.clientHeight || 600;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75)); r.setSize(w, h);
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.style.cssText = 'display:block;width:100%;height:100%';
    el.appendChild(r.domElement);
    const s = this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r); s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.7; pm.dispose();
    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.5, 300);
    s.add(new THREE.HemisphereLight('#ffffff', '#e6dfd6', 1.15));
    const sun = new THREE.DirectionalLight('#fff3e6', 2.7); sun.position.set(-20, 36, 22); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 26, bottom: -26, near: 5, far: 100 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4; s.add(sun);
    const fill = new THREE.DirectionalLight('#dbe8ff', 0.7); fill.position.set(24, 14, -18); s.add(fill);
    this._mats();
    this.root = new THREE.Group(); s.add(this.root);
    this.crowd = new Crowd(this, this.root);
    this.lr = new CSS2DRenderer(); this.lr.setSize(w, h); this.lr.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none'; el.appendChild(this.lr.domElement);
    this.screens = [];
    this._floor();
    this.zones = ZONES.map((z, i) => this._zone(z, i));
    this._hub();
    this._journeyPath();
    this._spokes();
    this._storyActors();
    this._walkers();
    this.crowd.build();
    this.updaters.push((t, dt) => { for (const tx of this.screens) tx.offset.y = (tx.offset.y - dt * 0.07) % 1; });
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(el);
    this.px = 0; this.py = 0;
    this._mv = (e) => { const b = el.getBoundingClientRect(); this.px = ((e.clientX - b.left) / b.width - 0.5) * 2; this.py = ((e.clientY - b.top) / b.height - 0.5) * 2; };
    addEventListener('pointermove', this._mv, { passive: true });
    this.clock = new THREE.Clock();
    this.resize();
    r.setAnimationLoop(() => this._frame());
  }

  _mats() {
    this.mats = {
      pearl: new THREE.MeshPhysicalMaterial({ color: '#f1eeea', roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
      white: new THREE.MeshStandardMaterial({ color: '#fbfbfa', roughness: 0.45 }),
      silver: new THREE.MeshStandardMaterial({ color: '#cfd5dd', roughness: 0.22, metalness: 0.85 }),
      dark: new THREE.MeshStandardMaterial({ color: '#2a2f38', roughness: 0.45, metalness: 0.4 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#d6e6f6', roughness: 0.04, transparent: true, opacity: 0.32, envMapIntensity: 2.2, clearcoat: 1, depthWrite: false }),
      orange: new THREE.MeshStandardMaterial({ color: '#f26b1d', roughness: 0.5 }),
      paper: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
      lane: new THREE.MeshPhysicalMaterial({ color: '#e9eef5', roughness: 0.2, metalness: 0.3, clearcoat: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: '#8bbd72', roughness: 0.9, flatShading: true }),
      pot: new THREE.MeshStandardMaterial({ color: '#efece8', roughness: 0.5 }),
      cloth: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }), pants: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
      skinI: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), hairI: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }),
      shoe: new THREE.MeshStandardMaterial({ color: '#1d2129', roughness: 0.5 })
    };
  }
  glow(c, k = 2.2) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false }); }
  sh(o, c = true, r = true) { o.castShadow = c; o.receiveShadow = r; return o; }
  label(parent, pos, html, cls = '') {
    const d = document.createElement('div'); d.className = 'll-label ' + cls; d.innerHTML = html;
    const o = new CSS2DObject(d); o.position.set(...pos); o.center.set(0.5, 1); parent.add(o); return d;
  }

  _floor() {
    const shape = new THREE.Shape(); const W = 40, D = 31, R = 6, x = -W / 2, y = -D / 2;
    shape.moveTo(x + R, y); shape.lineTo(x + W - R, y); shape.quadraticCurveTo(x + W, y, x + W, y + R); shape.lineTo(x + W, y + D - R);
    shape.quadraticCurveTo(x + W, y + D, x + W - R, y + D); shape.lineTo(x + R, y + D); shape.quadraticCurveTo(x, y + D, x, y + D - R); shape.lineTo(x, y + R); shape.quadraticCurveTo(x, y, x + R, y);
    const slab = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 3, curveSegments: 20 });
    slab.rotateX(Math.PI / 2); slab.translate(0, -0.22, -3);
    this.root.add(this.sh(new THREE.Mesh(slab, this.mats.pearl)));
    const pts = shape.getSpacedPoints(200).map((p) => new THREE.Vector3(p.x * 1.004, -0.75, p.y * 1.004 - 3));
    this.root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 360, 0.07, 6, true), this.glow('#ff8a3d', 2.4)));
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.ShadowMaterial({ opacity: 0.08 })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.6; shadow.receiveShadow = true; this.root.add(shadow);
    // planters
    const spots = [[-21, -15], [-21, 10], [21, -15], [21, 10], [-5, 11], [6, 11], [-2, -3], [8, -14], [-14, -14]];
    const pots = [], leaves = [];
    for (const [px, pz] of spots) { pots.push(new THREE.CylinderGeometry(0.5, 0.38, 0.8, 16).translate(px, 0.4, pz)); for (const [dx, dy, dz, sc] of [[0, 1.35, 0, 0.7], [0.32, 1.9, 0.12, 0.5], [-0.28, 2.05, -0.2, 0.45]]) leaves.push(new THREE.IcosahedronGeometry(sc, 1).translate(px + dx, dy, pz + dz)); }
    this.root.add(this.sh(new THREE.Mesh(merge(pots), this.mats.pot)), this.sh(new THREE.Mesh(merge(leaves), this.mats.leaf), true, false));
  }

  // workstation: desk + monitor + chair + seated person facing +z of the given frame
  _desk(g, x, z, yaw, shirt, extra = {}) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const dx = x + fx * 0.72, dz = z + fz * 0.72;
    const desk = new RoundedBoxGeometry(1.5, 0.07, 0.8, 2, 0.03); desk.rotateY(yaw); desk.translate(dx, 1.0, dz);
    const leg = new THREE.BoxGeometry(1.3, 0.95, 0.06); leg.rotateY(yaw); leg.translate(dx + fx * 0.32, 0.5, dz + fz * 0.32);
    const part = new THREE.BoxGeometry(1.5, 0.45, 0.05); part.rotateY(yaw); part.translate(dx + fx * 0.42, 1.25, dz + fz * 0.42);
    const seat = new RoundedBoxGeometry(0.5, 0.09, 0.5, 2, 0.03); seat.rotateY(yaw); seat.translate(x - fx * 0.05, 0.52, z - fz * 0.05);
    const back = new RoundedBoxGeometry(0.48, 0.55, 0.07, 2, 0.03); back.rotateY(yaw); back.translate(x - fx * 0.3, 0.86, z - fz * 0.3);
    (g.userData.desks ||= []).push(desk); (g.userData.legs ||= []).push(leg); (g.userData.parts ||= []).push(part); (g.userData.chairs ||= []).push(seat, back);
    (g.userData.mons ||= []).push([dx + fx * 0.2, 1.33, dz + fz * 0.2, yaw]);
    this.crowd.add({ x: g.position.x + x, z: g.position.z + z, y: 0, yaw, pose: 'sit', shirt, pants: '#2b2f38', speed: 0.85 + Math.random() * 0.3, ...extra });
  }
  _flushDesks(g, scrColor = '#41e0a0') {
    const u = g.userData; const m = this.mats;
    if (u.desks) g.add(this.sh(new THREE.Mesh(merge(u.desks), m.white)));
    if (u.legs) g.add(this.sh(new THREE.Mesh(merge(u.legs), m.silver)));
    if (u.parts) g.add(this.sh(new THREE.Mesh(merge(u.parts), m.orange)));
    if (u.chairs) g.add(this.sh(new THREE.Mesh(merge(u.chairs), m.dark)));
    if (u.mons) {
      const scr = screenTexture(scrColor); scr.wrapT = THREE.RepeatWrapping; this.screens.push(scr);
      const mat = new THREE.MeshStandardMaterial({ color: '#0d1420', emissiveMap: scr, emissive: '#ffffff', emissiveIntensity: 1.5, roughness: 0.3 });
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.66, 0.42, 0.04), mat, u.mons.length), o = new THREE.Object3D();
      u.mons.forEach(([x, y, z, yaw], i) => { o.position.set(x, y, z); o.rotation.set(-0.08, yaw + Math.PI, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.castShadow = true; g.add(im);
    }
    for (const k of ['desks', 'legs', 'parts', 'chairs', 'mons']) delete u[k];
  }

  _zone(z, i) {
    const [x, zz] = z.pos, m = this.mats;
    const g = new THREE.Group(); g.position.set(x, 0, zz); this.root.add(g);
    const yaw = Math.atan2(HUB[0] - x, HUB[1] - zz); // front faces the hub
    const inner = new THREE.Group(); inner.rotation.y = yaw; g.add(inner);
    // platform
    inner.add(this.sh(new THREE.Mesh(new RoundedBoxGeometry(9, 0.3, 6.4, 3, 0.15).translate(0, 0.15, 0), m.pearl)));
    inner.add(new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.05, 0.06).translate(0, 0.22, 3.21), this.glow('#5aa2ff', 2.2)));
    const ig = inner; ig.position.y = 0.3;
    if (z.key === 'enquiry') this._enquiry(ig);
    else if (z.key === 'counsel') this._counsel(ig);
    else if (z.key === 'apply') this._apply(ig);
    else this._pay(ig);
    // status indicator (amber issue → green resolved), hidden until the story needs it
    const ind = new THREE.Group(); ind.position.set(0, 7.4, 0); g.add(ind);
    const orbMat = this.glow('#f5a524', 2.6);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), orbMat); ind.add(orb);
    const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f5a524').multiplyScalar(2), transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 48), ringM); ind.add(ring);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ffb340'), transparent: true, depthWrite: false, opacity: 0.8, blending: THREE.AdditiveBlending })); halo.scale.set(3.2, 3.2, 1); ind.add(halo);
    ind.visible = false; ind.scale.setScalar(0.001);
    const lab = this.label(g, [0, 4.7, -0.5], `<i>${i + 1}</i>${z.label}`);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    return { ...z, g, yaw, ind, orbMat, ringM, halo, front: new THREE.Vector3(x + fx * 4.4, 0.42, zz + fz * 4.4), top: new THREE.Vector3(x, 7.4, zz), labelEl: lab };
  }

  _enquiry(g) {
    const m = this.mats;
    const counter = new THREE.Shape(); counter.absarc(0, 0, 2.4, Math.PI * 0.1, Math.PI * 0.9, false); counter.absarc(0, 0, 1.7, Math.PI * 0.9, Math.PI * 0.1, true);
    const cg = new THREE.ExtrudeGeometry(counter, { depth: 1.0, bevelEnabled: false, curveSegments: 24 }); cg.rotateX(-Math.PI / 2); cg.translate(0, 0, 0.3);
    g.add(this.sh(new THREE.Mesh(cg, m.white)));
    g.add(this.sh(new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.38, 2, 40, Math.PI * 0.8).rotateX(Math.PI / 2).rotateZ(Math.PI * 0.1).scale(1, 0.15, 1).translate(0, 1.02, 0.3), m.orange)));
    // receptionist behind the counter facing outward (+z) and two students approaching
    this.crowd.add({ x: 0, z: 0, y: 0.3, yaw: 0, pose: 'talk', shirt: '#f26b1d', pants: '#2b2f38', _local: g });
    // big enquiry screen
    g.add(this.sh(new THREE.Mesh(new RoundedBoxGeometry(3.4, 2.1, 0.14, 2, 0.05).translate(0, 2.7, -2.1), m.dark)));
    const scr = screenTexture('#5aa2ff'); scr.wrapT = THREE.RepeatWrapping; this.screens.push(scr);
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(3.15, 1.85).translate(0, 2.7, -2.02), new THREE.MeshBasicMaterial({ map: scr, toneMapped: false })));
    g.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7).translate(0, 0.85, -2.1), m.silver)));
    // floating enquiry chat bubbles
    this.bubbles = [];
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.55, 0.16, 3, 0.18), new THREE.MeshPhysicalMaterial({ color: k === 1 ? '#f26b1d' : '#5aa2ff', roughness: 0.25, clearcoat: 1 }));
      b.castShadow = true; g.add(b); this.bubbles.push({ b, k });
    }
    this.updaters.push((t) => this.bubbles.forEach(({ b, k }) => { b.position.set(-1.8 + k * 1.8, 3.9 + Math.sin(t * 1.4 + k) * 0.18, -0.6); b.rotation.y = Math.sin(t * 0.7 + k) * 0.3; }));
    this._toLocal(g);
  }
  _counsel(g) {
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) this._desk(g, -2.8 + k * 2.8, -1.4 + r * 2.4, Math.PI, ['#eef2f6', '#dbe7f5', '#f3efe8'][(k + r) % 3], { _local: g, y: 0.3 });
    // headset hint: small orange rings over heads are omitted for clarity; one counsellor stands coaching
    this.crowd.add({ x: 3.6, z: 2.2, y: 0.3, yaw: -2.4, pose: 'talk', shirt: '#f26b1d', pants: '#2b2f38', _local: g });
    this._flushDesks(g);
    this._toLocal(g);
  }
  _apply(g) {
    const m = this.mats;
    // document processing table with a glass scanner arch and a stack of forms
    g.add(this.sh(new THREE.Mesh(new RoundedBoxGeometry(5.4, 0.1, 1.4, 2, 0.04).translate(0, 1.0, -0.6), m.white)));
    g.add(this.sh(new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.95, 0.08).translate(0, 0.5, -1.2), m.silver)));
    const arch = new THREE.TorusGeometry(0.85, 0.12, 8, 30, Math.PI); arch.translate(0, 1.05, -0.6);
    g.add(this.sh(new THREE.Mesh(arch, m.silver)));
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.035, 6, 30, Math.PI).translate(0, 1.05, -0.48), this.glow('#5aa2ff', 2.6)));
    const stack = []; for (let k = 0; k < 6; k++) stack.push(new THREE.BoxGeometry(0.7, 0.03, 0.5).rotateY(k * 0.05).translate(-2.0, 1.07 + k * 0.035, -0.6));
    g.add(this.sh(new THREE.Mesh(merge(stack), m.paper)));
    const sheet = this.sh(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.45), m.paper)); g.add(sheet);
    this.updaters.push((t) => { const u = (t * 0.25) % 1; sheet.position.set(-1.6 + u * 3.4, 1.08, -0.6); });
    // floating document cards
    const cards = []; for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.9, 0.06, 2, 0.04), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 1 })); c.castShadow = true; g.add(c); cards.push(c); }
    this.updaters.push((t) => cards.forEach((c, k) => { c.position.set(-1.4 + k * 1.4, 3.3 + Math.sin(t * 1.2 + k * 1.3) * 0.15, -1.6); c.rotation.y = Math.sin(t * 0.6 + k) * 0.25; }));
    // two document specialists
    this._desk(g, -2.2, 1.6, Math.PI, '#dbe7f5', { _local: g, y: 0.3 });
    this._desk(g, 2.2, 1.6, Math.PI, '#eef2f6', { _local: g, y: 0.3 });
    this._flushDesks(g, '#5aa2ff');
    this._toLocal(g);
  }
  _pay(g) {
    const m = this.mats;
    // payment terminal on a pedestal
    g.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.1, 20).translate(-2.4, 0.55, 0), m.white)));
    g.add(this.sh(new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.12, 0.9, 2, 0.04).rotateX(-0.4).translate(-2.4, 1.2, 0), m.dark)));
    const card = this.sh(new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.03, 0.36, 2, 0.02), new THREE.MeshPhysicalMaterial({ color: '#2a6fdb', roughness: 0.3, clearcoat: 1 }))); g.add(card);
    this.updaters.push((t) => { const k = (Math.sin(t * 1.6) + 1) / 2; card.position.set(-2.4, 1.45 + k * 0.4, 0.25); card.rotation.x = -0.4; });
    // verification gate (glass arch) and enrollment podium with a check badge
    const gate = [new THREE.BoxGeometry(0.22, 3, 0.4).translate(0.4, 1.5, -0.4), new THREE.BoxGeometry(0.22, 3, 0.4).translate(2.8, 1.5, -0.4), new THREE.BoxGeometry(2.62, 0.28, 0.44).translate(1.6, 3.0, -0.4)];
    g.add(this.sh(new THREE.Mesh(merge(gate), m.silver)));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.7, 0.04).translate(1.6, 1.45, -0.4), m.glass));
    this.gateGlow = this.glow('#5aa2ff', 2.4);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.46).translate(1.6, 2.83, -0.4), this.gateGlow));
    g.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.5, 32).translate(1.6, 0.25, -2.2), m.white)));
    const badge = new THREE.Group(); badge.position.set(1.6, 1.6, -2.2); g.add(badge);
    this.badgeMat = new THREE.MeshPhysicalMaterial({ color: '#d7dde5', roughness: 0.3, clearcoat: 1, emissive: '#000000' });
    badge.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 36).rotateX(Math.PI / 2), this.badgeMat)));
    const tick = new THREE.Shape(); tick.moveTo(-0.32, 0.02); tick.lineTo(-0.1, -0.22); tick.lineTo(0.36, 0.26); tick.lineTo(0.27, 0.34); tick.lineTo(-0.1, -0.04); tick.lineTo(-0.23, 0.11); tick.closePath();
    badge.add(new THREE.Mesh(new THREE.ExtrudeGeometry(tick, { depth: 0.06, bevelEnabled: false }).translate(0, 0, 0.08), this.mats.white));
    this.updaters.push((t) => { badge.rotation.y = Math.sin(t * 0.8) * 0.5; });
    this._desk(g, -2.4, 2.0, Math.PI, '#f3efe8', { _local: g, y: 0.3 });
    this._flushDesks(g);
    this._toLocal(g);
  }
  // convert crowd entries placed in a rotated zone frame into world coordinates
  _toLocal(g) {
    g.updateWorldMatrix(true, false);
    const v = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const p of this.crowd.people) {
      if (p._local !== g) continue;
      v.set(p.x, 0, p.z).applyMatrix4(g.matrixWorld);
      g.getWorldQuaternion(q); e.setFromQuaternion(q, 'YXZ');
      p.x = v.x; p.z = v.z; p.yaw = (p.yaw || 0) + e.y; p._local = null;
    }
  }

  _hub() {
    const [x, z] = HUB, m = this.mats;
    const g = new THREE.Group(); g.position.set(x, 0, z); this.root.add(g); this.hubG = g;
    g.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.7, 0.5, 96).translate(0, 0.25, 0), m.pearl)));
    this.hubRingMat = this.glow('#ff8a3d', 2.6);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(6.72, 0.07, 6, 160).rotateX(Math.PI / 2).translate(0, 0.3, 0), this.hubRingMat));
    // curved video wall at the back (monitoring screens)
    const scr = screenTexture('#ff9a4d'); scr.wrapT = THREE.RepeatWrapping; scr.repeat.set(4, 1); this.screens.push(scr);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 2.2, 64, 1, true, Math.PI * 0.72, Math.PI * 0.56), new THREE.MeshBasicMaterial({ map: scr, side: THREE.DoubleSide, toneMapped: false, color: '#ffe3cc' }));
    wall.position.y = 2.6; g.add(wall);
    g.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(5.66, 5.66, 0.14, 64, 1, true, Math.PI * 0.72, Math.PI * 0.56).translate(0, 3.75, 0), m.silver)));
    g.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(5.66, 5.66, 0.14, 64, 1, true, Math.PI * 0.72, Math.PI * 0.56).translate(0, 1.45, 0), m.silver)));
    for (const a of [Math.PI * 0.72, Math.PI * 1.28]) g.add(this.sh(new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.9, 0.2).translate(Math.sin(a) * 5.7, 1.95, Math.cos(a) * 5.7), m.silver)));
    // ring of L1 specialists facing the video wall / centre
    for (let k = 0; k < 5; k++) {
      const a = Math.PI * 0.62 + (k / 4) * Math.PI * 0.76;
      const px = Math.sin(a) * 3.4, pz = Math.cos(a) * 3.4;
      this._desk(g, px, pz, a, k === 2 ? '#f26b1d' : ['#eef2f6', '#dbe7f5'][k % 2], { y: 0.5 });
    }
    this._flushDesks(g, '#ff9a4d');
    // the responding specialist (stands up during resolution)
    this.responder = { x: x + 0.6, z: z + 1.6, y: 0.5, yaw: Math.PI, pose: 'talk', shirt: '#f26b1d', pants: '#2b2f38', speed: 1.2 };
    this.crowd.add(this.responder); this.responder = this.crowd.people[this.crowd.people.length - 1];
    // ticket board column in the centre
    g.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.5, 32).translate(0, 0.75, -0.8), m.silver)));
    this.boardMat = new THREE.MeshStandardMaterial({ color: '#141a26', emissive: '#ff7a1a', emissiveIntensity: 0.4, roughness: 0.2 });
    g.add(this.sh(new THREE.Mesh(new RoundedBoxGeometry(1.8, 1.2, 0.12, 2, 0.05).translate(0, 1.8, -0.8), this.boardMat)));
    this.hubHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ff9a5a'), transparent: true, depthWrite: false, opacity: 0.25, blending: THREE.AdditiveBlending })); this.hubHalo.scale.set(9, 9, 1); this.hubHalo.position.y = 2.5; g.add(this.hubHalo);
    const lab = this.label(g, [0, 0.55, 6.9], '<i class="hub">L1</i>UNext L1 Support Hub', 'hub');
    this.hubTop = new THREE.Vector3(x, 3.4, z - 0.8);
    void lab;
  }

  _journeyPath() {
    const pts = [new THREE.Vector3(-16.5, 0.42, 6), ...this.zones.map((z) => z.front), new THREE.Vector3(15.8, 0.42, -0.5)];
    this.path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const lane = new THREE.TubeGeometry(this.path, 220, 0.7, 10).scale(1, 0.12, 1);
    this.root.add(this.sh(new THREE.Mesh(lane, this.mats.lane), false, true));
    this.root.add(new THREE.Mesh(new THREE.TubeGeometry(this.path, 220, 0.1, 6).scale(1, 0.5, 1).translate(0, 0.08, 0), this.glow('#5aa2ff', 1.8)));
    // u of each zone along the path
    const N = 400;
    this.zones.forEach((z) => { let best = 0, bd = 1e9; for (let i = 0; i <= N; i++) { const d = this.path.getPointAt(i / N).distanceTo(z.front); if (d < bd) { bd = d; best = i / N; } } z.u = best; });
    // pulse with a short trail
    this.pulse = []; for (let k = 0; k < 7; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.34 - k * 0.035, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a3d').multiplyScalar(2.6 - k * 0.25), transparent: true, opacity: 1 - k * 0.13, toneMapped: false, depthWrite: false })); this.root.add(p); this.pulse.push(p); }
    this.pulseHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ff8a3d'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 })); this.pulseHalo.scale.set(2.6, 2.6, 1); this.root.add(this.pulseHalo);
  }

  _spokes() {
    this.spokes = this.zones.map((z) => {
      const a = z.top.clone().setY(6.9), b = this.hubTop.clone(); const mid = a.clone().lerp(b, 0.5); mid.y = 9.5;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5aa2ff').multiplyScalar(1.6), transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false });
      this.root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.04, 5), mat));
      return { curve, mat };
    });
  }

  _storyActors() {
    const tk = new THREE.Group(); this.root.add(tk); this.ticket = tk;
    tk.add(new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.68, 0.08, 2, 0.06), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, clearcoat: 1, emissive: '#f5a524', emissiveIntensity: 0.35 })));
    tk.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.68, 0.09).translate(-0.42, 0, 0), this.glow('#f5a524', 2.4)));
    for (let j = 0; j < 3; j++) tk.add(new THREE.Mesh(new THREE.BoxGeometry(0.5 - j * 0.1, 0.05, 0.1).translate(0.08, 0.16 - j * 0.15, 0), this.mats.dark));
    const th = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ffb340'), transparent: true, depthWrite: false, opacity: 0.7, blending: THREE.AdditiveBlending })); th.scale.set(2.4, 2.4, 1); tk.add(th);
    tk.visible = false;
    this.fix = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), this.glow('#22c55e', 2.8)); this.fix.visible = false; this.root.add(this.fix);
    this.updaters.push((t) => this._story(t));
  }

  _walkers() {
    const loops = [[[-6, 9], [5, 9.5], [6, 12], [-5, 12]], [[-19, 4], [-12, 6], [-14, 8.5], [-20, 7]], [[9, 6], [16, 6.5], [15, 9], [9, 9]]];
    loops.slice(0, this.quality === 'low' ? 1 : 3).forEach((p, k) => this.crowd.add({ pose: 'walk', path: p, x: 0, z: 0, y: 0.02, shirt: ['#5aa2ff', '#f3efe8', '#dbe7f5'][k], pants: '#2b2f38', speed: 0.75 + k * 0.1, phase: k * 2 }));
  }

  // ---- the illustrative 15 s loop ----
  _story(t) {
    const loop = Math.floor(t / LOOP), lt = t - loop * LOOP;
    const issue = this.zones[loop % 2 === 0 ? 2 : 3];         // alternate: application, then payment
    const uI = issue.u, end = 0.995;
    let u, step;
    if (lt < 4) { u = ease(lt / 4) * uI; step = 'Enquiry moving through the journey'; }
    else if (lt < 10.7) { u = uI; step = lt < 5 ? `Issue detected · ${issue.label}` : lt < 7.5 ? 'Ticket raised to UNext L1 support' : lt < 9.5 ? 'L1 specialist resolving' : 'Resolved · journey resumes'; }
    else if (lt < 14) { u = uI + ease((lt - 10.7) / 3.3) * (end - uI); step = 'Enrollment completed'; }
    else { u = end; step = 'Enrollment completed'; }
    const fade = lt > 14 ? 1 - (lt - 14) : lt < 0.4 ? lt / 0.4 : 1;
    // pulse + trail
    this.pulse.forEach((p, k) => { const uu = Math.max(0, u - k * 0.006); p.position.copy(this.path.getPointAt(Math.min(1, uu))).setY(0.75); p.material.opacity = (1 - k * 0.13) * fade; });
    this.pulseHalo.position.copy(this.pulse[0].position); this.pulseHalo.material.opacity = 0.85 * fade;
    const amber = lt >= 4 && lt < 10.7;
    this.pulse[0].material.color.set(amber ? '#f5a524' : '#ff8a3d').multiplyScalar(2.6);
    // indicators
    for (const z of this.zones) {
      const on = z === issue && lt >= 4 && lt < 12.2;
      z.ind.visible = on;
      if (!on) { z.ind.scale.setScalar(0.001); continue; }
      const pop = clamp01((lt - 4) / 0.4), out = lt > 11.6 ? 1 - clamp01((lt - 11.6) / 0.6) : 1;
      z.ind.scale.setScalar(Math.max(0.001, ease(pop) * out));
      const green = lt >= 10.4;
      const c = new THREE.Color(green ? '#22c55e' : '#f5a524');
      z.orbMat.color.copy(c).multiplyScalar(2.6); z.ringM.color.copy(c).multiplyScalar(2);
      z.halo.material.color.copy(c);
      z.ind.children[1].rotation.x = Math.PI / 2; z.ind.children[1].scale.setScalar(1 + ((lt * 1.5) % 1) * 0.6); z.ringM.opacity = 0.7 * (1 - ((lt * 1.5) % 1));
      z.ind.position.y = 7.4 + Math.sin(t * 2) * 0.12;
    }
    // ticket: issue → hub
    const sp = this.spokes[this.zones.indexOf(issue)];
    this.spokes.forEach((s) => (s.mat.opacity = s === sp && lt > 4.8 && lt < 10.8 ? 0.6 : 0.18));
    if (lt >= 5 && lt < 7.6) { const k = ease(clamp01((lt - 5) / 2.5)); this.ticket.visible = true; this.ticket.position.copy(sp.curve.getPointAt(k)); this.ticket.lookAt(this.camera.position); this.ticket.scale.setScalar(0.9 + Math.sin(k * Math.PI) * 0.25); }
    else this.ticket.visible = false;
    // hub response
    const busy = lt >= 7.5 && lt < 9.6;
    this.boardMat.emissiveIntensity = busy ? 0.9 + Math.sin(t * 10) * 0.3 : 0.35;
    this.hubHalo.material.opacity = busy ? 0.55 : 0.22;
    this.hubRingMat.color.set(busy ? '#ffb15c' : '#ff8a3d').multiplyScalar(busy ? 3 : 2.6);
    this.responder.speed = busy ? 2.2 : 0.7;
    // resolution: hub → issue (green)
    if (lt >= 9.5 && lt < 10.6) { const k = ease(clamp01((lt - 9.5) / 1.1)); this.fix.visible = true; this.fix.position.copy(sp.curve.getPointAt(1 - k)); }
    else this.fix.visible = false;
    // enrollment confirmed
    const done = lt >= 13.4;
    if (this.badgeMat) { this.badgeMat.color.set(done ? '#22c55e' : '#d7dde5'); this.badgeMat.emissive.set(done ? '#0b5a2a' : '#000000'); }
    if (this.gateGlow) this.gateGlow.color.set(done ? '#22c55e' : lt > 12.5 ? '#ff8a3d' : '#5aa2ff').multiplyScalar(2.4);
    if (step !== this._step) { this._step = step; this.onStep({ step, issue: issue.label, phase: lt < 4 ? 0 : lt < 5 ? 1 : lt < 7.5 ? 2 : lt < 9.5 ? 3 : lt < 10.7 ? 4 : 5 }); }
  }

  setTime(t) { this.fixed = t; }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight; if (!w || !h) return;
    const a = w / h; this.camera.aspect = a;
    const hf = Math.tan(THREE.MathUtils.degToRad(17)) * a; const d = Math.max(46, 21 / hf); // fit ~42 units of width
    this.base = new THREE.Vector3(0.14, 0.62, 0.77).normalize().multiplyScalar(d);
    this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h); this.lr.setSize(w, h);
  }

  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (document.hidden) return;
    if (this.fixed !== null) this.t = this.fixed; else if (!this.reduced) this.t += dt;
    for (const u of this.updaters) u(this.t, this.fixed !== null ? 1 / 30 : dt);
    const target = new THREE.Vector3(0, 1.0, -2.6);
    const off = this.base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (this.reduced ? 0 : Math.sin(this.t * 0.07) * 0.08) + this.px * 0.05);
    off.y += -this.py * 1.6;
    this.camera.position.lerp(target.clone().add(off), this._init ? 0.05 : 1); this._init = true;
    this.camera.lookAt(target);
    this.renderer.render(this.scene, this.camera);
    this.lr.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null); this._ro.disconnect(); removeEventListener('pointermove', this._mv);
    this.scene.traverse((o) => { o.geometry?.dispose(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; ms.forEach((mm) => { mm.map?.dispose(); mm.dispose(); }); });
    this.renderer.dispose(); this.renderer.domElement.remove(); this.lr.domElement.remove();
  }
}
