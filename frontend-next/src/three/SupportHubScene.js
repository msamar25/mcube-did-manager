// UNext L1 Support Operations Hub — real-time Three.js scene (Dashboard hero).
// Central elevated glass-and-metal platform with the official UNext "u" (extruded from the logo SVG),
// L1 agents around it, four admissions-journey zones (back arc) and four ticket-lifecycle zones (front arc),
// joined to the hub by illuminated pathways. A ~15 s ILLUSTRATIVE loop shows one ticket going
// admissions zone → Incoming → L1 hub (amber→blue) → In Progress → Resolved (or, sometimes, Failed).
// People, tickets and pulses are illustrative; they do not represent real employees or live cases.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LabelLayer } from './labels.js';
import { Crowd } from './parts/people.js';
import { glowTexture, screenTexture } from './textures.js';
import logoRaw from '../assets/unext-logo.svg?raw';
import './support.css';
import { ADMISSIONS_ENABLED } from '../lib/support.js';

const NI = (g) => (g.index ? g.toNonIndexed() : g);
const merge = (a) => mergeGeometries(a.map(NI));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const LOOP = 15;
const ZL = (k) => ZONES.find((z) => z.key === k)?.label || k;

const ICON = {
  user: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0"/>',
  headset: '<path d="M4 13a8 8 0 0 1 16 0M4 13v4a2 2 0 0 0 2 2h1v-6H4m16 0v4a2 2 0 0 1-2 2h-1v-6h3"/>',
  doc: '<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/>',
  card: '<path d="M3 6h18v12H3zM3 10h18M7 15h4"/>',
  mail: '<path d="M3 6h18v12H3zM3 7l9 6 9-6"/>',
  gear: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-2V4h-4v2L9 8 7 7 5 11l2 1v2l-2 1 2 4 2-1 2 2v2h4v-2l2-2 2 1 2-4-2-1z"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  alert: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>',
  team: '<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M10 20a6 6 0 0 1 12 0"/>'
};
const svgIcon = (k) => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

const ALL_ZONES = [
  { key: 'enquiries', group: 'admissions', label: 'Student Enquiries', icon: 'user', color: '#f59e0b', pos: [-22, -8.5], kind: 'meet' },
  { key: 'guidance', group: 'admissions', label: 'Counsellor Guidance', icon: 'headset', color: '#3b82f6', pos: [-8.5, -17.5], kind: 'desks' },
  { key: 'application', group: 'admissions', label: 'Application Processing', icon: 'doc', color: '#3b82f6', pos: [8.5, -17.5], kind: 'desks' },
  { key: 'payment', group: 'admissions', label: 'Payment & Enrollment', icon: 'card', color: '#22c55e', pos: [22, -8.5], kind: 'desks' },
  { key: 'incoming', group: 'tickets', label: 'Incoming Tickets', icon: 'mail', color: '#f59e0b', pos: [-22, 9.5], kind: 'intake' },
  { key: 'progress', group: 'tickets', label: 'In Progress', icon: 'gear', color: '#3b82f6', pos: [-8.5, 18], kind: 'desks' },
  { key: 'resolved', group: 'tickets', label: 'Resolved', icon: 'check', color: '#22c55e', pos: [8.5, 18], kind: 'desks' },
  { key: 'failed', group: 'tickets', label: 'Failed', icon: 'alert', color: '#ef4444', pos: [22, 9.5], kind: 'alert' }
];
// Ticket-only layout (admissions hidden): a clockwise ring around the hub.
const TICKET_RING = { incoming: [-17, -10], progress: [17, -10], resolved: [17, 10], failed: [-17, 10] };
export const ZONES = ADMISSIONS_ENABLED ? ALL_ZONES : ALL_ZONES.filter((z) => z.group === 'tickets').map((z) => ({ ...z, pos: TICKET_RING[z.key] }));
const ENTRY = new THREE.Vector3(-26, 3.4, -10); // where new tickets come from when admissions are hidden


export class SupportHubScene {
  constructor(el, opts = {}) {
    // showcase: login backdrop (no counts, gentle auto-orbit, no zoom)
    this.el = el; this.data = opts.data || {}; this.showcase = !!opts.showcase; this.onSelect = opts.onSelect || (() => {}); this.onStep = opts.onStep || (() => {});
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
    this.quality = opts.quality === 'low' || (opts.quality !== 'high' && lowPower) ? 'low' : 'high';
    this.updaters = []; this.hit = []; this.zones = new Map(); this.noReflect = []; this.screens = []; this.t = 0; this.fixed = null; this.visible = true;
    const w = el.clientWidth || 900, h = el.clientHeight || 520;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.dprMax = this.quality === 'low' ? 1.25 : 1.75; r.setPixelRatio(Math.min(devicePixelRatio || 1, this.dprMax)); r.setSize(w, h);
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0 * 2.2; // lights are scaled by 1/2.2 so only emissive parts pass the bloom threshold
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.className = 'sh-canvas'; el.appendChild(r.domElement);
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color('#e9e6e2'); s.fog = new THREE.Fog('#e9e6e2', 90, 170);
    const pm = new THREE.PMREMGenerator(r); s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.6 / 2.2; pm.dispose();
    this.camera = new THREE.PerspectiveCamera(32, w / h, 0.5, 300);
    s.add(new THREE.HemisphereLight('#ffffff', '#e4dbd1', 1.05 / 2.2));
    const sun = new THREE.DirectionalLight('#fff4e8', 2.4 / 2.2); sun.position.set(-26, 44, 30); sun.castShadow = true;
    const sm = this.quality === 'low' ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
    Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 30, bottom: -30, near: 10, far: 130 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4; s.add(sun);
    const fill = new THREE.DirectionalLight('#dce8ff', 0.6 / 2.2); fill.position.set(30, 18, -30); s.add(fill);

    const controls = this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, minDistance: 24, maxDistance: 110, maxPolarAngle: 1.2, minPolarAngle: 0.25, enablePan: false, rotateSpeed: 0.5, zoomSpeed: 0.8 });
    if (matchMedia('(pointer: coarse)').matches) { controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE }; r.domElement.style.touchAction = 'pan-y'; }
    if (this.showcase) Object.assign(controls, { enableZoom: false, autoRotate: !this.reduced, autoRotateSpeed: 0.35 });
    controls.addEventListener('start', () => { this.tween = null; this._user = true; });

    // No bloom pass: it tone-maps the glowing pathways into pastel on a light floor. Halo sprites give the glow.
    this.lr = new CSS2DRenderer(); this.lr.setSize(w, h); this.lr.domElement.className = 'sh-labels'; el.appendChild(this.lr.domElement);
    this.labels = new LabelLayer(el, { reserve: opts.reserve || '' });

    this._mats();
    this.root = new THREE.Group(); s.add(this.root);
    this.crowd = new Crowd(this, this.root);
    this._floor(w, h);
    this._hub();
    for (const z of ZONES) this._zone(z);
    this._lanes();
    this._walkers();
    this.crowd.build();
    this._ticket();
    this.updaters.push((t, dt) => { for (const tx of this.screens) tx.offset.y = (tx.offset.y - dt * 0.07) % 1; });

    this.ray = new THREE.Raycaster(); this.ptr = new THREE.Vector2();
    this._down = (e) => { this._dn = [e.clientX, e.clientY]; };
    this._up = (e) => {
      if (this._dn && Math.hypot(e.clientX - this._dn[0], e.clientY - this._dn[1]) > 6) return;
      const b = r.domElement.getBoundingClientRect(); this.ptr.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      this.ray.setFromCamera(this.ptr, this.camera); const p = this.ray.intersectObjects(this.hit, false)[0]?.object.userData;
      this.onSelect(p || { type: 'none' });
    };
    this._move = (e) => { const b = r.domElement.getBoundingClientRect(); this.ptr.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); this.ray.setFromCamera(this.ptr, this.camera); r.domElement.style.cursor = this.ray.intersectObjects(this.hit, false).length ? 'pointer' : 'grab'; };
    r.domElement.addEventListener('pointerdown', this._down); r.domElement.addEventListener('pointerup', this._up); r.domElement.addEventListener('pointermove', this._move);

    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(el);
    this._io = new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; }); this._io.observe(el);
    this.clock = new THREE.Clock();
    this.resize();
    r.setAnimationLoop(() => this._frame());
  }

  _mats() {
    this.m = {
      pearl: new THREE.MeshPhysicalMaterial({ color: '#f5f3f0', roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
      white: new THREE.MeshStandardMaterial({ color: '#fbfbfa', roughness: 0.42 }),
      silver: new THREE.MeshStandardMaterial({ color: '#cfd5dd', roughness: 0.2, metalness: 0.9 }),
      steel: new THREE.MeshStandardMaterial({ color: '#8d96a3', roughness: 0.25, metalness: 0.85 }),
      dark: new THREE.MeshStandardMaterial({ color: '#272c35', roughness: 0.45, metalness: 0.4 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#dfeaf5', roughness: 0.03, transparent: true, opacity: 0.28, envMapIntensity: 2.2, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }),
      orange: new THREE.MeshStandardMaterial({ color: '#f26b1d', roughness: 0.5 }),
      wood: new THREE.MeshStandardMaterial({ color: '#efe6da', roughness: 0.55 }),
      leaf: new THREE.MeshStandardMaterial({ color: '#4f9a45', roughness: 0.85, flatShading: true }),
      pot: new THREE.MeshStandardMaterial({ color: '#f4f2ef', roughness: 0.4 }),
      cloth: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }), pants: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
      skinI: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), hairI: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }),
      shoe: new THREE.MeshStandardMaterial({ color: '#1d2129', roughness: 0.5 })
    };
    this.mats = this.m; // Crowd reads s.mats
  }
  glow(c, k = 2.2) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false }); }
  sh(o, c = true, r = true) { o.castShadow = c; o.receiveShadow = r; return o; }
  _hitBox(parent, w, h, d, payload, x = 0, z = 0) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false })); b.position.set(x, h / 2, z); b.userData = payload; parent.add(b); this.hit.push(b); }

  _floor(w, h) {
    const W = 72, D = 58;
    const shape = new THREE.Shape(); const R = 8, x = -W / 2, y = -D / 2;
    shape.moveTo(x + R, y); shape.lineTo(x + W - R, y); shape.quadraticCurveTo(x + W, y, x + W, y + R); shape.lineTo(x + W, y + D - R); shape.quadraticCurveTo(x + W, y + D, x + W - R, y + D); shape.lineTo(x + R, y + D); shape.quadraticCurveTo(x, y + D, x, y + D - R); shape.lineTo(x, y + R); shape.quadraticCurveTo(x, y, x + R, y);
    const geo = new THREE.ShapeGeometry(shape, 24); geo.rotateX(-Math.PI / 2);
    if (this.quality === 'high') {
      const pr = this.renderer.getPixelRatio();
      const mirror = new Reflector(geo, { clipBias: 0.003, textureWidth: Math.round(w * pr * 0.5), textureHeight: Math.round(h * pr * 0.5), color: new THREE.Color(0.9, 0.9, 0.92) });
      const orig = mirror.onBeforeRender.bind(mirror);
      mirror.onBeforeRender = (...a) => { for (const o of this.noReflect) o.visible = false; orig(...a); for (const o of this.noReflect) o.visible = true; };
      this.root.add(mirror); this.mirror = mirror;
    }
    const tile = document.createElement('canvas'); tile.width = tile.height = 256; const g = tile.getContext('2d');
    g.fillStyle = '#f4f2ef'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(120,110,100,0.09)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
    const tt = new THREE.CanvasTexture(tile); tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.colorSpace = THREE.SRGBColorSpace; tt.anisotropy = 8;
    const over = new THREE.Mesh(geo.clone(), new THREE.MeshStandardMaterial({ map: tt, roughness: 0.25, metalness: 0.05, transparent: this.quality === 'high', opacity: this.quality === 'high' ? 0.88 : 1, depthWrite: false }));
    const uv = over.geometry.attributes.uv, pos = over.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getZ(i) / 4);
    over.position.y = 0.01; over.receiveShadow = true; this.root.add(over); this.noReflect.push(over);
    // concentric glowing floor rings around the hub (reference look)
    for (const [rr, k] of [[11.2, 2.4], [13.4, 1.6]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.08, 6, 200), this.glow('#ff8a3d', k)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; this.root.add(ring); }
    const pool = new THREE.Mesh(new THREE.CircleGeometry(15, 96), new THREE.MeshBasicMaterial({ map: glowTexture('#ff9a4d'), transparent: true, depthWrite: false, opacity: 0.35, blending: THREE.AdditiveBlending, toneMapped: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.03; this.root.add(pool); this.noReflect.push(pool);
    // planters around the floor
    const spots = [[-31, -22], [-15, -24], [0, -24], [15, -24], [31, -22], [-33, 0], [33, 0], [-31, 22], [-15, 23], [0, 26], [15, 23], [31, 22], ...(ADMISSIONS_ENABLED ? [[-14, -6], [14, -6], [-14, 7], [14, 7]] : [[-23, 0], [23, 0], [0, -17.5], [0, 17.5]])];
    this._plants(spots);
  }
  _plants(spots) {
    const pots = [], leaves = [];
    for (const [px, pz] of spots) {
      pots.push(new THREE.CylinderGeometry(0.5, 0.38, 0.85, 18).translate(px, 0.42, pz));
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; const lf = new THREE.ConeGeometry(0.22, 1.5, 5); lf.translate(0, 0.75, 0); lf.rotateZ(0.55); lf.rotateY(a); lf.translate(px, 0.85, pz); leaves.push(lf); }
      leaves.push(new THREE.ConeGeometry(0.2, 1.7, 5).translate(px, 1.7, pz));
    }
    this.root.add(this.sh(new THREE.Mesh(merge(pots), this.m.pot)), this.sh(new THREE.Mesh(merge(leaves), this.m.leaf), true, false));
  }

  // desk + monitor + chair + seated person; person sits at (x,z) facing yaw (local to group g)
  _desk(g, x, z, yaw, shirt, scr) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), dx = x + fx * 0.75, dz = z + fz * 0.75, u = g.userData;
    const put = (geo, arr) => { geo.rotateY(yaw); (u[arr] ||= []).push(geo); return geo; };
    put(new RoundedBoxGeometry(1.6, 0.07, 0.85, 2, 0.03), 'desk').translate(dx, 1.0, dz);
    put(new THREE.BoxGeometry(0.06, 0.95, 0.75), 'leg').translate(dx - fz * 0.72 + 0, 0.5, dz + fx * 0.72);
    put(new THREE.BoxGeometry(0.06, 0.95, 0.75), 'leg').translate(dx + fz * 0.72, 0.5, dz - fx * 0.72);
    put(new RoundedBoxGeometry(0.42, 0.55, 0.6, 2, 0.04), 'ped').translate(dx + fz * 0.45, 0.3, dz - fx * 0.45);
    put(new RoundedBoxGeometry(0.5, 0.09, 0.5, 2, 0.03), 'chair').translate(x - fx * 0.05, 0.52, z - fz * 0.05);
    put(new RoundedBoxGeometry(0.48, 0.56, 0.07, 2, 0.03), 'chair').translate(x - fx * 0.3, 0.86, z - fz * 0.3);
    put(new THREE.BoxGeometry(0.62, 0.05, 0.22), 'kb').translate(dx - fx * 0.12, 1.05, dz - fz * 0.12);
    (u.mons ||= []).push({ x: dx + fx * 0.25, z: dz + fz * 0.25, yaw, scr });
    (u.ppl ||= []).push({ x, z, yaw, shirt });
  }
  _flush(g) {
    const u = g.userData, m = this.m;
    if (u.desk) g.add(this.sh(new THREE.Mesh(merge(u.desk), m.white)));
    if (u.leg) g.add(this.sh(new THREE.Mesh(merge(u.leg), m.silver)));
    if (u.ped) g.add(this.sh(new THREE.Mesh(merge(u.ped), m.white)));
    if (u.chair) g.add(this.sh(new THREE.Mesh(merge(u.chair), m.dark)));
    if (u.kb) g.add(this.sh(new THREE.Mesh(merge(u.kb), m.dark)));
    if (u.mons) {
      const byScr = new Map(); u.mons.forEach((mo) => { if (!byScr.has(mo.scr)) byScr.set(mo.scr, []); byScr.get(mo.scr).push(mo); });
      for (const [scr, list] of byScr) {
        const mat = new THREE.MeshStandardMaterial({ color: '#0c1220', emissiveMap: scr, emissive: '#ffffff', emissiveIntensity: 1.35, roughness: 0.25 });
        const scrIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.44, 0.03), mat, list.length);
        const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(0.76, 0.5, 0.025), m.dark, list.length);
        const stand = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.08, 0.3, 8), m.silver, list.length);
        const o = new THREE.Object3D();
        list.forEach((mo, i) => {
          o.rotation.set(-0.06, mo.yaw + Math.PI, 0); o.position.set(mo.x, 1.38, mo.z); o.updateMatrix(); scrIM.setMatrixAt(i, o.matrix);
          o.position.set(mo.x + Math.sin(mo.yaw) * 0.02, 1.38, mo.z + Math.cos(mo.yaw) * 0.02); o.updateMatrix(); frame.setMatrixAt(i, o.matrix);
          o.rotation.set(0, 0, 0); o.position.set(mo.x + Math.sin(mo.yaw) * 0.04, 1.16, mo.z + Math.cos(mo.yaw) * 0.04); o.updateMatrix(); stand.setMatrixAt(i, o.matrix);
        });
        frame.castShadow = stand.castShadow = true; g.add(scrIM, frame, stand);
        if (!u.monMats) u.monMats = []; u.monMats.push(mat);
      }
    }
    // people → world coordinates
    if (u.ppl) {
      g.updateWorldMatrix(true, false); const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
      g.getWorldQuaternion(q); e.setFromQuaternion(q, 'YXZ');
      for (const p of u.ppl) { v.set(p.x, 0, p.z).applyMatrix4(g.matrixWorld); this.crowd.add({ x: v.x, z: v.z, y: v.y, yaw: p.yaw + e.y, pose: p.pose || 'sit', shirt: p.shirt, pants: '#2b2f38', speed: 0.8 + Math.random() * 0.4 }); }
    }
    for (const k of ['desk', 'leg', 'ped', 'chair', 'kb', 'mons', 'ppl']) delete u[k];
  }
  _scr(color) { this._scrCache ||= new Map(); if (!this._scrCache.has(color)) { const t = screenTexture(color); t.wrapT = THREE.RepeatWrapping; this.screens.push(t); this._scrCache.set(color, t); } return this._scrCache.get(color); }

  // ---------- central hub ----------
  _hub() {
    const m = this.m, g = new THREE.Group(); this.root.add(g); this.hubG = g;
    const R = 9.6, H = 0.9;
    g.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.4, H, 128).translate(0, H / 2, 0), m.steel)));
    g.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(R - 0.1, R - 0.1, 0.08, 128).translate(0, H + 0.04, 0), m.pearl), false, true));
    this.hubRing = this.glow('#ff8a3d', 2.8);
    for (const [rr, y, t] of [[R + 0.42, 0.12, 0.09], [R + 0.05, H - 0.1, 0.07], [R - 1.1, H + 0.1, 0.06]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, t, 6, 200), this.hubRing); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring); }
    // glass balustrade with silver rail (gaps where lanes arrive)
    const bal = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.25, R - 0.25, 0.95, 128, 1, true), m.glass); bal.position.y = H + 0.5; g.add(bal);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(R - 0.25, 0.05, 6, 160), m.silver); rail.rotation.x = Math.PI / 2; rail.position.y = H + 0.98; g.add(rail);
    // L1 agents ring: 10 desks facing outward, backs to the emblem
    g.userData.y0 = H;
    const hub = new THREE.Group(); hub.position.y = H; g.add(hub); hub.userData.y0 = 0;
    this.heroDeskIndex = 7;
    const scrO = this._scr('#ff9a4d'), scrB = this._scr('#5aa2ff');
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.PI / 10;
      const px = Math.sin(a) * 5.2, pz = Math.cos(a) * 5.2;
      this._desk(hub, px, pz, a, k % 3 === 0 ? '#f26b1d' : ['#eef2f6', '#dbe7f5'][k % 2], k % 2 ? scrB : scrO);
    }
    hub.position.y = H; this._flush(hub);
    // hero monitor that lights up during investigation
    const a = (this.heroDeskIndex / 10) * Math.PI * 2 + Math.PI / 10;
    this.heroMon = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.46), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd0ff').multiplyScalar(2), transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    this.heroMon.position.set(Math.sin(a) * 6.22, H + 1.38, Math.cos(a) * 6.22); this.heroMon.rotation.y = a + Math.PI; g.add(this.heroMon);
    this.heroAt = new THREE.Vector3(Math.sin(a) * 6.2, H + 2.4, Math.cos(a) * 6.2);
    // central dais
    g.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.6, 0.5, 96).translate(0, H + 0.25, 0), m.silver)));
    g.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.0, 1.7, 96).translate(0, H + 0.5 + 0.85, 0), m.pearl)));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.02, 3.02, 0.9, 96, 1, true, -1.15, 2.3), new THREE.MeshBasicMaterial({ map: this._brandBand(), transparent: true }));
    band.position.y = H + 1.35; g.add(band);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.06, 6, 120).rotateX(Math.PI / 2).translate(0, H + 2.22, 0), this.hubRing));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.12, 96), new THREE.MeshStandardMaterial({ color: '#ffb26b', emissive: '#ff7a1a', emissiveIntensity: 1.1, roughness: 0.2 }));
    disc.position.y = H + 2.28; g.add(disc);
    // the UNext "u" emblem extruded from the official logo path
    const U = this._emblem(); U.position.y = H + 2.35; g.add(U); this.emblem = U;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ff9a4d'), transparent: true, depthWrite: false, opacity: 0.5, blending: THREE.AdditiveBlending })); halo.scale.set(13, 13, 1); halo.position.y = H + 4.6; g.add(halo); this.hubHalo = halo;
    const pl = new THREE.PointLight('#ff8a3d', 60 / 2.2, 26, 2); pl.position.y = H + 4; g.add(pl);
    this.updaters.push((t) => { U.rotation.y = Math.sin(t * 0.35) * 0.18; });
    this._hitBox(g, 2 * R, 8, 2 * R, { type: 'hub' });
    this.hubLabel = this.labels.add(g, [R * 0.92, 1.2, 1.5], `<span class="ic" style="--c:#f26b1d">${svgIcon('team')}</span><span><b>L1 Support Team</b><small>Resolve · Guide · Escalate</small></span>`, { cls: 'sh-pill hub', priority: 1, anchor: [0, 0.5], nudge: true, pad: 7, onClick: () => this.onSelect({ type: 'hub' }) });
  }
  _brandBand() {
    // one bold line, sized to fill the visible front arc of the dais
    const c = document.createElement('canvas'); c.width = 2048; c.height = 256; const g = c.getContext('2d');
    g.textBaseline = 'middle'; const f1 = '800 168px Inter, system-ui, sans-serif', f2 = '650 168px Inter, system-ui, sans-serif';
    g.font = f1; const w1 = g.measureText('UNext ').width; g.font = f2; const w2 = g.measureText('SupportHub').width;
    const k = Math.min(1, 1900 / (w1 + w2)); g.setTransform(k, 0, 0, 1, 1024 - ((w1 + w2) * k) / 2, 0);
    const gr = g.createLinearGradient(0, 0, w1, 0); gr.addColorStop(0, '#ff9a1f'); gr.addColorStop(1, '#e63a1c');
    g.font = f1; g.fillStyle = gr; g.fillText('UNext ', 0, 132); g.font = f2; g.fillStyle = '#1b2230'; g.fillText('SupportHub', w1, 132);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  _emblem() {
    const data = new SVGLoader().parse(logoRaw.replace(/currentColor/g, '#000').replace(/url\(#[^)]*\)/g, '#000'));
    const path = data.paths[0]; // the gradient "u" of the official wordmark
    const shapes = SVGLoader.createShapes(path);
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: 26, bevelEnabled: true, bevelThickness: 3, bevelSize: 2.2, bevelSegments: 5, curveSegments: 28 });
    geo.center(); geo.scale(0.072, -0.072, -0.072); // mirror Y (SVG is y-down) and Z to keep winding geo.computeVertexNormals(); geo.computeBoundingBox();
    const bb = geo.boundingBox, pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const a = new THREE.Color('#ff9a1f'), b = new THREE.Color('#e63a1c'), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const k = clamp01((pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x)); c.lerpColors(a, b, k * k * (3 - 2 * k)); col.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = this.sh(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1, emissive: '#5a1400', emissiveIntensity: 0.35 })), true, false);
    const g = new THREE.Group(); mesh.position.y = -bb.min.y; g.add(mesh); return g;
  }

  // ---------- zones ----------
  _zone(z) {
    const m = this.m, [x, zz] = z.pos;
    const g = new THREE.Group(); g.position.set(x, 0, zz); this.root.add(g);
    const yaw = Math.atan2(-x, -zz); // local +z points at the hub
    const f = new THREE.Group(); f.rotation.y = yaw; g.add(f);
    const PW = 11, PD = 7.4, PH = 0.45;
    f.add(this.sh(new THREE.Mesh(new RoundedBoxGeometry(PW, PH, PD, 3, 0.18).translate(0, PH / 2, 0), m.pearl)));
    const edge = this.glow(z.color, 2.4);
    f.add(new THREE.Mesh(new THREE.BoxGeometry(PW - 0.3, 0.06, 0.07).translate(0, PH - 0.04, PD / 2 + 0.01), edge));
    for (const sx of [-1, 1]) f.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, PD - 0.3).translate(sx * (PW / 2 + 0.01), PH - 0.04, 0), edge));
    // glass partitions on back + one side with silver posts and rails
    const glass = [], posts = [];
    glass.push(new THREE.BoxGeometry(PW - 0.4, 2.3, 0.05).translate(0, PH + 1.15, -PD / 2 + 0.2));
    glass.push(new THREE.BoxGeometry(0.05, 2.3, PD * 0.55).translate(-PW / 2 + 0.2, PH + 1.15, -PD * 0.2));
    for (const px of [-PW / 2 + 0.2, -PW / 6, PW / 6, PW / 2 - 0.2]) posts.push(new THREE.BoxGeometry(0.08, 2.3, 0.08).translate(px, PH + 1.15, -PD / 2 + 0.2));
    posts.push(new THREE.BoxGeometry(PW - 0.4, 0.06, 0.08).translate(0, PH + 2.3, -PD / 2 + 0.2), new THREE.BoxGeometry(0.08, 0.06, PD * 0.55).translate(-PW / 2 + 0.2, PH + 2.3, -PD * 0.2));
    f.add(new THREE.Mesh(merge(glass), m.glass)); f.add(this.sh(new THREE.Mesh(merge(posts), m.silver)));
    // wall display on the back partition
    const scr = this._scr(z.color);
    f.add(this.sh(new THREE.Mesh(new RoundedBoxGeometry(3.4, 1.9, 0.12, 2, 0.05).translate(PW / 2 - 2.6, PH + 1.45, -PD / 2 + 0.32), m.dark)));
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(3.15, 1.65), new THREE.MeshBasicMaterial({ map: scr, toneMapped: false, color: '#dfe9ff' })); wall.position.set(PW / 2 - 2.6, PH + 1.45, -PD / 2 + 0.39); f.add(wall);
    // furniture by kind
    const ws = new THREE.Group(); ws.position.y = PH; f.add(ws); ws.userData.y0 = PH;
    const shirts = ['#eef2f6', '#dbe7f5', '#f3efe8', '#f26b1d'];
    if (z.kind === 'meet') {
      ws.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.08, 40).translate(-1.4, 1.0, 0.2), m.white)));
      ws.add(this.sh(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.45, 0.95, 20).translate(-1.4, 0.5, 0.2), m.silver)));
      ws.userData.ppl = [[0, 1.85, Math.PI], [1.6, -0.9, -2.1], [-1.6, -0.9, 2.1]].map(([dx, dz, yw], k) => ({ x: -1.4 + dx, z: 0.2 + dz, yaw: yw + Math.PI, shirt: shirts[k], pose: k === 0 ? 'talk' : 'sit' }));
      const chairs = [[1.6, -0.9], [-1.6, -0.9]].map(([dx, dz]) => new RoundedBoxGeometry(0.5, 0.09, 0.5, 2, 0.03).translate(-1.4 + dx, 0.52, 0.2 + dz));
      ws.add(this.sh(new THREE.Mesh(merge(chairs), m.dark)));
      this._desk(ws, 2.6, 1.4, Math.PI, shirts[1], scr);
    } else if (z.kind === 'intake') {
      // intake counter + large incoming-ticket display
      ws.add(this.sh(new THREE.Mesh(new RoundedBoxGeometry(4.2, 1.05, 0.9, 2, 0.1).translate(-1.6, 0.52, 0.6), m.white)));
      ws.add(new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.05, 0.92).translate(-1.6, 1.02, 0.6), this.glow(z.color, 2.2)));
      ws.userData.ppl = [{ x: -1.6, z: -0.3, yaw: 0, shirt: '#f26b1d', pose: 'talk' }];
      this._desk(ws, 2.4, 1.2, Math.PI, shirts[0], scr);
      this.crowd.add({ pose: 'walk', path: [[x + 3, zz + 4], [x + 6, zz + 2], [x + 5, zz + 5.5]], x: 0, z: 0, y: 0, shirt: '#dbe7f5', pants: '#2b2f38', speed: 0.7 });
    } else if (z.kind === 'alert') {
      this._desk(ws, -2.4, 1.3, Math.PI, shirts[0], scr);
      this._desk(ws, 0.2, 1.3, Math.PI, shirts[1], scr);
      ws.userData.ppl.push({ x: 3.2, z: 1.8, yaw: Math.PI * 0.8, shirt: '#eef2f6', pose: 'talk' });
    } else {
      for (let k = 0; k < 4; k++) this._desk(ws, -3.6 + k * 2.4, 1.3, Math.PI, shirts[k % 4], scr);
      if (z.key === 'guidance' || z.key === 'progress') ws.userData.ppl.push({ x: 3.9, z: -1.6, yaw: -2.6, shirt: '#f26b1d', pose: 'talk' });
    }
    this._flush(ws);
    // status beacon above the zone
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), this.glow(z.color, 3)); beacon.position.set(PW / 2 - 0.6, PH + 2.55, -PD / 2 + 0.2); f.add(beacon);
    // pulse ring (used by the story)
    const pulseM = new THREE.MeshBasicMaterial({ color: new THREE.Color(z.color).multiplyScalar(2.2), transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    const pulse = new THREE.Mesh(new THREE.RingGeometry(3.5, 3.8, 80), pulseM); pulse.rotation.x = -Math.PI / 2; pulse.position.y = PH + 0.05; g.add(pulse); this.noReflect.push(pulse);
    this._hitBox(f, PW, 4, PD, { type: 'zone', key: z.key });
    const label = this.labels.add(g, [0, PH + 3.4, 0], `<span class="ic" style="--c:${z.color}">${svgIcon(z.icon)}</span><span><b>${z.label}</b>${this.showcase ? '' : `<em data-k="${z.key}">${this._count(z.key)}</em>`}</span>`, { cls: 'sh-pill ' + z.group + ' ' + z.key, priority: 10 + ZONES.indexOf(z), anchor: [0.5, 1], nudge: true, pad: 7, onClick: () => this.onSelect({ type: 'zone', key: z.key }) });
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    this.zones.set(z.key, { ...z, g, yaw, pulseM, pulse, label, front: new THREE.Vector3(x + fx * (PD / 2 + 0.3), 0.06, zz + fz * (PD / 2 + 0.3)), top: new THREE.Vector3(x, PH + 2.6, zz), monMats: ws.userData.monMats || [] });
  }
  _count(k) { const d = this.data || {}; const v = d.counts?.[k] ?? d.admissions?.[k]; return v === undefined ? '—' : Number(v).toLocaleString('en-IN'); }

  // ---------- illuminated lanes + ambient floating cards ----------
  _lanes() {
    const lanes = [], glowBy = new Map(); this.laneCurves = [];
    for (const z of this.zones.values()) {
      const a = z.front.clone(), dir = a.clone().setY(0).normalize(), b = dir.clone().multiplyScalar(10.2).setY(0.06);
      const len = a.distanceTo(b), mid = a.clone().lerp(b, 0.5), ang = Math.atan2(b.x - a.x, b.z - a.z);
      lanes.push(new RoundedBoxGeometry(2.4, 0.08, len, 2, 0.03).rotateY(ang).translate(mid.x, 0.06, mid.z));
      const gl = glowBy.get(z.color) || []; for (const s of [-1, 1]) gl.push(new THREE.BoxGeometry(0.08, 0.05, len).translate(s * 1.2, 0, 0).rotateY(ang).translate(mid.x, 0.11, mid.z)); glowBy.set(z.color, gl);
      const curve = new THREE.LineCurve3(a.clone().setY(0.9), b.clone().setY(0.9)); this.laneCurves.push({ curve, z });
    }
    this.root.add(this.sh(new THREE.Mesh(merge(lanes), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.85 })), false, true));
    for (const [c, gl] of glowBy) this.root.add(new THREE.Mesh(merge(gl), this.glow(c, 2.4)));
    // ambient translucent "cards" drifting along each lane
    const card = document.createElement('canvas'); card.width = 128; card.height = 88; const g = card.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.95)'; rr(g, 2, 2, 124, 84, 12); g.fill(); g.fillStyle = 'rgba(20,26,38,0.25)'; g.fillRect(16, 22, 60, 8); g.fillRect(16, 40, 90, 6); g.fillRect(16, 54, 70, 6);
    const tex = new THREE.CanvasTexture(card); tex.colorSpace = THREE.SRGBColorSpace;
    const per = this.quality === 'low' ? 1 : 2, n = this.laneCurves.length * per;
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.15, 0.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), n);
    im.frustumCulled = false; this.root.add(im); this.noReflect.push(im);
    this.laneCurves.forEach((l, i) => { for (let k = 0; k < per; k++) im.setColorAt(i * per + k, new THREE.Color(l.z.color).lerp(new THREE.Color('#ffffff'), 0.55).multiplyScalar(1.3)); });
    const o = new THREE.Object3D();
    this.updaters.push((t) => {
      this.laneCurves.forEach((l, i) => { for (let k = 0; k < per; k++) {
        let u = (t * 0.07 + k / per + i * 0.17) % 1; if (l.z.group === 'tickets') u = 1 - u; // admissions flow in, results flow out
        o.position.copy(l.curve.getPointAt(u)); o.position.y = 0.9 + Math.sin(t * 2 + i + k) * 0.08; o.quaternion.copy(this.camera.quaternion); o.scale.setScalar(Math.sin(u * Math.PI) * 0.9 + 0.1); o.updateMatrix(); im.setMatrixAt(i * per + k, o.matrix);
      } });
      im.instanceMatrix.needsUpdate = true;
    });
  }

  _walkers() {
    const loops = [[[-13, -1], [-13, 4], [-16, 4], [-16, -1]], [[13, -1], [16, -1], [16, 4], [13, 4]], [[-4, 13], [4, 13], [4, 15], [-4, 15]], [[-4, -13.5], [4, -13.5], [3, -12], [-3, -12]]];
    loops.slice(0, this.quality === 'low' ? 2 : 4).forEach((p, k) => this.crowd.add({ pose: 'walk', path: p, x: 0, z: 0, y: 0.02, shirt: ['#f26b1d', '#dbe7f5', '#eef2f6', '#2a6fdb'][k], pants: '#2b2f38', speed: 0.7 + k * 0.08, phase: k * 2 }));
  }

  // ---------- signature ticket ----------
  _ticket() {
    const g = new THREE.Group(); this.root.add(g); this.tk = g;
    this.tkMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.2, clearcoat: 1, emissive: '#f59e0b', emissiveIntensity: 0.6 });
    g.add(new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.0, 0.08, 2, 0.08), this.tkMat));
    this.tkStripe = this.glow('#f59e0b', 2.6); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.0, 0.09).translate(-0.65, 0, 0), this.tkStripe));
    for (let j = 0; j < 3; j++) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8 - j * 0.15, 0.07, 0.1).translate(0.12, 0.25 - j * 0.22, 0), this.m.dark));
    this.tkHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ffb340'), transparent: true, depthWrite: false, opacity: 0.75, blending: THREE.AdditiveBlending })); this.tkHalo.scale.set(3.4, 3.4, 1); g.add(this.tkHalo);
    this.trail = []; for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.16 - k * 0.02, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb340').multiplyScalar(2), transparent: true, opacity: 0.6 - k * 0.09, toneMapped: false, depthWrite: false })); this.root.add(p); this.trail.push(p); }
    this.trailPts = [];
    this.updaters.push((t) => this._story(t));
  }
  _arc(a, b, h = 6) { const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(a.y, b.y) + h; return new THREE.QuadraticBezierCurve3(a, mid, b); }
  // Real tickets (dashboard): setStory([{ ticket_no, agent_name, stage, status, at, live }]). The ticket travels
  // only as far as its real stage (incoming → hub → progress → resolved / failed). Without a story (login
  // backdrop) the original illustrative loop plays.
  setStory(items) {
    const key = (items || []).map((x) => x.ticket_no + ':' + x.stage).join('|');
    if (key === this._storyKey) return;
    const firstNew = items?.[0]?.live && items[0].ticket_no + ':' + items[0].stage !== this._storyHead;
    this._storyKey = key; this._storyHead = items?.[0] ? items[0].ticket_no + ':' + items[0].stage : '';
    this.story = items?.length ? items : null;
    if (firstNew || this._storyT0 === undefined) this._storyT0 = this.t; // play a new live change right away
  }
  _story(t) {
    const real = this.story;
    const rt = real ? t - (this._storyT0 || 0) : t;
    const loop = Math.max(0, Math.floor(rt / LOOP));
    let lt = rt - loop * LOOP;
    const item = real ? real[loop % real.length] : null;
    const src = !item && ADMISSIONS_ENABLED ? ['enquiries', 'guidance', 'application', 'payment'][loop % 4] : null;
    const failed = item ? item.stage === 'failed' : loop % 3 === 2;
    // hold the ticket at its real stage
    const HOLD = { incoming: 3.59, hub: 8.19, progress: 10.19, resolved: 14.19, failed: 14.19 };
    const realLt = lt;
    if (item) lt = Math.min(lt, HOLD[item.stage] ?? 14.19);
    const Z = (k) => this.zones.get(k);
    const P = { src: src ? Z(src).top.clone().setY(3.4) : ENTRY.clone(), inc: Z('incoming').top.clone().setY(3.4), hub: this.heroAt.clone(), prog: Z('progress').top.clone().setY(3.4), end: Z(failed ? 'failed' : 'resolved').top.clone().setY(3.4) };
    const amber = new THREE.Color('#f59e0b'), blue = new THREE.Color('#3b82f6'), green = new THREE.Color('#22c55e'), red = new THREE.Color('#ef4444');
    let pos, col = amber, vis = true, step, phase;
    if (lt < 1) { pos = P.src.clone().add(new THREE.Vector3(0, ease(lt) * 0.8 - 0.8, 0)); step = src ? `Issue reported · ${ZL(src)}` : 'New ticket raised by an agent'; phase = 0; }
    else if (lt < 3.6) { pos = this._arc(P.src, P.inc, 5).getPointAt(ease((lt - 1) / 2.6)); step = 'Ticket arrives in Incoming'; phase = 0; }
    else if (lt < 5.8) { pos = this._arc(P.inc, P.hub, 4).getPointAt(ease((lt - 3.6) / 2.2)); step = 'Routed to the UNext L1 hub'; phase = 1; }
    else if (lt < 8.2) { const k = clamp01((lt - 5.8) / 1.6); pos = P.hub.clone().add(new THREE.Vector3(0, Math.sin(t * 2) * 0.1, 0)); col = amber.clone().lerp(blue, ease(k)); step = 'L1 agent investigating'; phase = 1; }
    else if (lt < 10.2) { pos = this._arc(P.hub, P.prog, 4).getPointAt(ease((lt - 8.2) / 2)); col = blue; step = 'In progress'; phase = 2; }
    else if (lt < 12.4) { const k = ease((lt - 10.2) / 2.2); pos = this._arc(P.prog, P.end, 3.5).getPointAt(k); col = blue.clone().lerp(failed ? red : green, clamp01(k * 1.4)); step = failed ? 'Could not be resolved · Failed' : 'Resolved'; phase = 3; }
    else if (lt < 14.2) { pos = P.end.clone(); col = failed ? red : green; step = failed ? 'Could not be resolved · Failed' : 'Resolved'; phase = 3; }
    else { pos = P.end.clone(); col = failed ? red : green; vis = false; step = failed ? 'Could not be resolved · Failed' : 'Resolved'; phase = 3; }
    const fl = item ? realLt : lt;
    if (item) vis = fl < 14.2;
    const fade = fl < 0.4 ? fl / 0.4 : fl > 13.6 ? Math.max(0, 1 - (fl - 13.6) / 0.6) : 1;
    this.tk.visible = vis && fade > 0.01; this.tk.position.copy(pos); this.tk.quaternion.copy(this.camera.quaternion); this.tk.scale.setScalar(0.6 + 0.4 * fade);
    this.tkMat.emissive.copy(col); this.tkStripe.color.copy(col).multiplyScalar(2.6); this.tkHalo.material.color.copy(col); this.tkHalo.material.opacity = 0.75 * fade;
    this.trailPts.unshift(pos.clone()); if (this.trailPts.length > 24) this.trailPts.length = 24;
    this.trail.forEach((p, k) => { const q = this.trailPts[Math.min(this.trailPts.length - 1, (k + 1) * 3)]; p.position.copy(q); p.material.color.copy(col).multiplyScalar(2); p.visible = this.tk.visible && lt > 1 && lt < 12.4; });
    // investigation: hero monitor lights up, hub ring brightens
    const inv = lt >= 5.6 && lt < 8.4 ? Math.sin(clamp01((lt - 5.6) / 2.8) * Math.PI) : 0;
    this.heroMon.material.opacity = inv * 0.9; this.hubHalo.material.opacity = 0.45 + inv * 0.25;
    // zone pulses
    for (const z of this.zones.values()) z.pulseM.opacity = 0;
    const pulseAt = (k, t0) => { const z = Z(k), u = clamp01((lt - t0) / 1.6); if (u > 0 && u < 1) { z.pulseM.opacity = (1 - u) * 0.9; z.pulse.scale.setScalar(0.7 + u * 0.7); } };
    if (src) pulseAt(src, 0); pulseAt('incoming', 3.4); pulseAt('progress', 10); pulseAt(failed ? 'failed' : 'resolved', 12.4);
    if (item) {
      const L = { incoming: 'Waiting in Incoming', hub: item.status === 'approved' ? 'Approved · ready to replace' : 'L1 review', progress: item.status === 'needs_reconciliation' ? 'Needs reconciliation' : 'Replacement in progress', resolved: 'Resolved · new DID assigned', failed: item.status === 'rejected' ? 'Rejected' : 'Failed' };
      const sk = item.ticket_no + item.stage + phase;
      if (sk !== this._step) { this._step = sk; this.onStep({ step: `${item.ticket_no} · ${L[item.stage]}`, phase, failed, ticket: item, live: !!item.live }); }
    } else if (step !== this._step) { this._step = step; this.onStep({ step, phase, failed, source: src ? ZL(src) : 'Agent' }); }
  }

  // ---------- camera, selection, data ----------
  _view() {
    const a = this.camera.aspect, hf = Math.tan(THREE.MathUtils.degToRad(16)) * a;
    // fit both the depth of the floor plan (vertical) and its width (horizontal)
    const d = ADMISSIONS_ENABLED ? Math.max(60, 34 / hf) : Math.max(50, 29 / hf);
    const tg = new THREE.Vector3(0, 1.2, ADMISSIONS_ENABLED ? 2.2 : 1.2);
    return { target: tg, pos: new THREE.Vector3(0, 0.74, 0.67).normalize().multiplyScalar(d).add(tg) };
  }
  // camera tweens run on wall-clock time so slow devices still finish on schedule
  flyTo(target, pos, dur = 1.1) { this.tween = { t: 0, dur, t0: performance.now(), fT: this.controls.target.clone(), fP: this.camera.position.clone(), tT: target, tP: pos }; }
  select(sel) {
    for (const z of this.zones.values()) z.label?.classList.toggle('on', sel?.type === 'zone' && sel.key === z.key);
    this.hubLabel?.classList.toggle('on', sel?.type === 'hub');
    this.labels.update(true);
    if (!sel || sel.type === 'none') return;
    // gentle focus: move partway toward the zone so its neighbours stay in view and clickable
    const zp = sel.type === 'hub' ? null : this.zones.get(sel.key)?.g.position;
    if (sel.type !== 'hub' && !zp) return;
    const c = sel.type === 'hub' ? new THREE.Vector3(0, 2, 0) : zp.clone().multiplyScalar(0.55).setY(1.5);
    const dir = sel.type === 'hub' ? new THREE.Vector3(0, 0.72, 0.7) : c.clone().setY(0).normalize().multiplyScalar(0.35).add(new THREE.Vector3(0, 0.8, 0.62)).normalize();
    this.flyTo(c, c.clone().add(dir.multiplyScalar(sel.type === 'hub' ? 38 : 42)));
  }
  resetView() { this._user = false; const v = this._view(); this.flyTo(v.target, v.pos); this.select(null); }
  setData(d) {
    this.data = d;
    for (const z of this.zones.values()) { const n = z.label?.querySelector(`[data-k="${z.key}"]`); if (n) n.textContent = this._count(z.key); }
  }
  setTime(t) { this.fixed = t; }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight; if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h); this.composer?.setSize(w, h); this.lr.setSize(w, h);
    if (this.mirror) { const pr = this.renderer.getPixelRatio(); this.mirror.getRenderTarget().setSize(Math.round(w * pr * 0.5), Math.round(h * pr * 0.5)); }
    this.labels.setCompact(w < 980);
    if (!this._user) { const v = this._view(); if (this.tween) { this.tween.tT = v.target; this.tween.tP = v.pos; } else { this.controls.target.copy(v.target); this.camera.position.copy(v.pos); } }
  }

  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.disposed || !this.visible || this.paused || document.hidden) return;
    // adaptive pixel ratio: drop resolution if frames are slow
    this._acc = (this._acc || 0) + dt; this._n = (this._n || 0) + 1;
    if (this._acc > 2) { const fps = this._n / this._acc; const pr = this.renderer.getPixelRatio(); if (fps < 28 && pr > 1) this._setPR(Math.max(1, pr - 0.25)); else if (fps > 55 && pr < Math.min(devicePixelRatio || 1, this.dprMax)) this._setPR(Math.min(this.dprMax, pr + 0.25)); this._acc = 0; this._n = 0; }
    if (this.fixed !== null) this.t = this.fixed; else if (!this.reduced) this.t += dt;
    for (const u of this.updaters) u(this.t, this.fixed !== null ? 1 / 30 : this.reduced ? 0 : dt);
    if (this.tween) { const tw = this.tween; tw.t = Math.min(1, (performance.now() - tw.t0) / (tw.dur * 1000)); const e = ease(tw.t); this.controls.target.lerpVectors(tw.fT, tw.tT, e); this.camera.position.lerpVectors(tw.fP, tw.tP, e); if (tw.t >= 1) this.tween = null; }
    this.controls.update();
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.lr.render(this.scene, this.camera); this.labels.update(!!this.tween);
  }
  _setPR(pr) { this.renderer.setPixelRatio(pr); const w = this.el.clientWidth, h = this.el.clientHeight; this.renderer.setSize(w, h); this.composer?.setPixelRatio?.(pr); this.composer?.setSize(w, h); }

  dispose() {
    this.disposed = true; this.renderer.setAnimationLoop(null); this._ro.disconnect(); this._io.disconnect();
    const c = this.renderer.domElement; c.removeEventListener('pointerdown', this._down); c.removeEventListener('pointerup', this._up); c.removeEventListener('pointermove', this._move);
    this.controls.dispose();
    this.scene.traverse((o) => { o.geometry?.dispose(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; ms.forEach((mm) => { for (const k in mm) if (mm[k]?.isTexture) mm[k].dispose(); mm.dispose(); }); });
    this.mirror?.dispose?.(); this.composer?.dispose?.(); this.renderer.dispose(); c.remove(); this.lr.domElement.remove();
  }
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
