// One UNext office floor (cutaway) and the DID replacement process inside it:
//   operator gateways (back row, exact MCube operator names) → trunk bus → UNext Support Team hub
//   → replacement status path → agent desk rows. Animated people and call routes are ILLUSTRATIVE ONLY.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plainBox, rng } from '../geometry.js';
import { facadeTextures, officeFloorTexture, carpetTexture, phoneGlyphTexture, glowTexture, screenTexture, beamTexture, rackTextures } from '../textures.js';
import { logoTexture, logoSvg, family } from '../logos.js';
import { Crowd } from './people.js';
import logoRaw from '../../assets/unext-logo.svg?raw';

export const LAYOUT = {
  W: 76, D: 52,
  GZ: -16,                      // operator gateway row
  BUS: -10.6,                   // trunk bus in front of gateways
  hub: [0, 3],
  agents: { x0: 15, x1: 35, z0: 7, z1: 22 },
  lounge: [-25, 15]
};
const f = (v) => (v === undefined || v === null ? '—' : Number(v).toLocaleString('en-IN'));

function roundedRect(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function arcSlab(r1, r2, a0, a1, h, y) {
  const shape = new THREE.Shape(); shape.absarc(0, 0, r2, a0, a1, false); shape.absarc(0, 0, r1, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 28 });
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g;
}

export function buildOffice(s, w, h) {
  s.crowd = new Crowd(s, s.scene);
  s.seats = [];          // agent seats (for call routes)
  s.screens = [];        // animated screen textures
  buildShell(s, w, h);
  const ops = s.data?.operators || [];
  const span = Math.min(66, ops.length * 7.6), step = ops.length > 1 ? span / (ops.length - 1) : 0;
  ops.forEach((op, i) => buildGateway(s, op, i, -span / 2 + i * step, ops));
  buildBus(s, span);
  buildSupportHub(s);
  buildAgentRows(s);
  buildLounge(s);
  buildWalkers(s);
  s.crowd.build();
  buildCallRoutes(s);
  // monitor activity
  s.updaters.push((t, dt) => { for (const tx of s.screens) tx.offset.y = (tx.offset.y - dt * 0.08) % 1; });
}

// ---------- floor slab, glossy floor, curtain walls, inlays ----------
function buildShell(s, w, h) {
  const { W, D } = LAYOUT, m = s.mats;
  const shape = roundedRect(W, D, 4);
  const slab = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 3, curveSegments: 16 });
  slab.rotateX(Math.PI / 2); slab.translate(0, -0.3, 0);
  s.scene.add(s._shadow(new THREE.Mesh(slab, m.slab), true, true));
  const pts = shape.getSpacedPoints(240).map((p) => new THREE.Vector3(p.x * 1.006, -0.8, p.y * 1.006));
  s.scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 420, 0.09, 6, true), s.glow('#ff8a3d', 2.6)));
  const floorGeo = new THREE.ShapeGeometry(shape, 16); floorGeo.rotateX(-Math.PI / 2);
  if (s.quality === 'high' && !s.clay) {
    const pr = s.renderer.getPixelRatio();
    const mirror = new Reflector(floorGeo, { clipBias: 0.003, textureWidth: Math.round(w * pr * 0.5), textureHeight: Math.round(h * pr * 0.5), color: new THREE.Color(1.55, 1.6, 1.7) });
    const orig = mirror.onBeforeRender.bind(mirror);
    mirror.onBeforeRender = (...a) => { for (const o of s.noReflect) o.visible = false; orig(...a); for (const o of s.noReflect) o.visible = true; };
    s.scene.add(mirror); s.mirror = mirror;
  }
  const ft = officeFloorTexture(s.clay);
  const glossy = s.quality === 'high' && !s.clay;
  const over = new THREE.Mesh(floorGeo.clone(), new THREE.MeshStandardMaterial({ map: ft, color: s.clay ? '#ffffff' : '#f1f2f4', roughness: 0.28, metalness: 0.05, transparent: glossy, opacity: glossy ? 0.84 : 1, depthWrite: false }));
  const uv = over.geometry.attributes.uv, pos = over.geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 8, pos.getZ(i) / 8);
  over.position.y = 0.015; over.receiveShadow = true; s.scene.add(over); s.noReflect.push(over);

  // orange circuit inlay around the hub
  const inlay = new THREE.Mesh(new THREE.CircleGeometry(16, 96), new THREE.MeshBasicMaterial({ map: circuitTexture(), transparent: true, depthWrite: false, opacity: s.clay ? 0.35 : 0.9 }));
  inlay.rotation.x = -Math.PI / 2; inlay.position.set(LAYOUT.hub[0], 0.03, LAYOUT.hub[1]); s.scene.add(inlay); s.noReflect.push(inlay);

  // carpet under agents and lounge
  for (const [cx, cz, cw, cd] of [[(LAYOUT.agents.x0 + LAYOUT.agents.x1) / 2, (LAYOUT.agents.z0 + LAYOUT.agents.z1) / 2, 23, 18], [LAYOUT.lounge[0], LAYOUT.lounge[1], 17, 13]]) {
    const ct = carpetTexture(s.clay); ct.repeat.set(0.12, 0.12);
    const carpet = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(cw, cd, 1.5)), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.95 }));
    carpet.rotation.x = -Math.PI / 2; carpet.position.set(cx, 0.035, cz); carpet.receiveShadow = true; s.scene.add(carpet); s.noReflect.push(carpet);
  }

  // glass curtain walls (back + left) with mullions and a soffit light line
  const wallH = 8.5, glass = facadeTextures(s.clay ? 'clay' : 'glass', 31, false).map; glass.repeat.set(14, 1.2);
  const frame = [], panes = [];
  const wall = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const add = (geo) => { geo.rotateY(-ang); geo.translate(cx, 0, cz); return geo; };
    frame.push(add(new THREE.BoxGeometry(len, 0.5, 0.7).translate(0, 0.25, 0)), add(new THREE.BoxGeometry(len, 0.35, 0.8).translate(0, wallH, 0)));
    panes.push(add(new THREE.BoxGeometry(len, wallH - 0.5, 0.08).translate(0, (wallH + 0.5) / 2, 0)));
    for (let k = 0; k <= Math.round(len / 3.2); k++) { const lx = -len / 2 + (k * len) / Math.round(len / 3.2); frame.push(add(new THREE.BoxGeometry(0.14, wallH, 0.2).translate(lx, wallH / 2, 0.05))); }
    frame.push(add(new THREE.BoxGeometry(len, 0.08, 0.24).translate(0, 3.1, 0.06)));
  };
  wall(-W / 2 + 3, -D / 2 + 0.6, W / 2 - 3, -D / 2 + 0.6);
  wall(-W / 2 + 0.6, D / 2 - 3, -W / 2 + 0.6, -D / 2 + 3);
  s.scene.add(s._shadow(new THREE.Mesh(mergeGeometries(frame), m.mullion)));
  s.scene.add(new THREE.Mesh(mergeGeometries(panes), new THREE.MeshPhysicalMaterial({ map: glass, color: '#dfe9f5', roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.55, envMapIntensity: 1.8, depthWrite: false })));
  const soffit = new THREE.Mesh(new THREE.BoxGeometry(W - 8, 0.08, 0.1), s.glow('#ff7a1a', 2.4)); soffit.position.set(0, wallH - 0.25, -D / 2 + 1.05); s.scene.add(soffit);
  // UNext SupportHub wall sign (official logo SVG)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.4), new THREE.MeshBasicMaterial({ map: brandSignTexture(), toneMapped: true, transparent: true }));
  sign.position.set(-W / 2 + 1.25, 4.6, 6); sign.rotation.y = Math.PI / 2; sign.scale.setScalar(0.85); s.scene.add(sign);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.5, D * 1.6), s.mats.contact);
  sh.rotation.x = -Math.PI / 2; sh.position.y = -2.2; s.scene.add(sh);
}

function circuitTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const r = rng(13);
  g.translate(S / 2, S / 2);
  g.strokeStyle = 'rgba(242,120,30,0.85)'; g.fillStyle = 'rgba(242,120,30,0.9)'; g.lineCap = 'round';
  for (const rad of [300, 420]) { g.lineWidth = rad === 300 ? 10 : 6; g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.stroke(); }
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2 + r() * 0.05, r0 = 300 + (k % 2 ? 0 : 120), r1 = 380 + r() * 120;
    g.lineWidth = 5; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    const mid = (r0 + r1) / 2, a2 = a + (r() - 0.5) * 0.12;
    g.lineTo(Math.cos(a) * mid, Math.sin(a) * mid); g.lineTo(Math.cos(a2) * r1, Math.sin(a2) * r1); g.stroke();
    g.beginPath(); g.arc(Math.cos(a2) * r1, Math.sin(a2) * r1, 9, 0, 7); g.fill();
    if (k % 3 === 0) { g.fillRect(Math.cos(a) * mid - 14, Math.sin(a) * mid - 14, 28, 28); }
  }
  const grad = g.createRadialGradient(0, 0, 380, 0, 0, 512); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = grad; g.fillRect(-S / 2, -S / 2, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function brandSignTexture() {
  const c = document.createElement('canvas'); c.width = 1300; c.height = 340; const g = c.getContext('2d');
  g.fillStyle = '#141a26'; roundRect(g, 0, 0, 1300, 340, 40); g.fill();
  g.fillStyle = '#f26b1d'; g.fillRect(0, 300, 1300, 10);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    g.drawImage(img, 80, 95, 560, 148);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(700, 90, 4, 160);
    g.fillStyle = '#ffffff'; g.font = '700 96px Inter, sans-serif'; g.textBaseline = 'middle'; g.fillText('SupportHub', 750, 172);
    t.needsUpdate = true;
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoRaw.replace(/currentColor/g, '#ffffff').replace('<svg', '<svg width="321" height="85"'));
  return t;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ---------- operator gateways ----------
const rackTex = { v: null };
function buildGateway(s, op, i, x, ops) {
  const z = LAYOUT.GZ, m = s.mats, fam = family(op.key);
  const g = new THREE.Group(); g.position.set(x, 0, z); s.scene.add(g);
  const maxT = Math.max(...ops.map((o) => o.active + o.pool));
  const H = 3.4 + ((op.active + op.pool) / maxT) * 2.6, Wg = 5.4, Dg = 4.2;
  // plinth + LED strip
  g.add(s._shadow(new THREE.Mesh(new RoundedBoxGeometry(Wg + 1, 0.45, Dg + 1, 3, 0.18).translate(0, 0.225, 0), m.metal)));
  const glowMat = s.glow(op.color, 2.6);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(Wg + 1.02, 0.07, Dg + 1.02).translate(0, 0.2, 0), glowMat));
  // rack cabinet with lit blades
  if (!rackTex.v) rackTex.v = rackTextures();
  const rm = new THREE.MeshStandardMaterial({ map: rackTex.v.map, emissiveMap: rackTex.v.emissive, emissive: '#ffffff', emissiveIntensity: s.clay ? 0.25 : 1.8, roughness: 0.4, metalness: 0.6 });
  const racks = [];
  for (let k = 0; k < 3; k++) racks.push(new THREE.BoxGeometry(1.3, H - 0.6, 2.6).translate(-1.6 + k * 1.6, 0.45 + (H - 0.6) / 2, -0.2));
  g.add(s._shadow(new THREE.Mesh(mergeGeometries(racks), rm)));
  // glass enclosure + metal corner posts + roof slab
  const enc = new THREE.Mesh(new THREE.BoxGeometry(Wg, H, Dg), m.vaultGlass); enc.position.y = 0.45 + H / 2; g.add(enc);
  const posts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) posts.push(new THREE.BoxGeometry(0.16, H, 0.16).translate(sx * Wg / 2, 0.45 + H / 2, sz * Dg / 2));
  posts.push(new THREE.BoxGeometry(Wg + 0.2, 0.12, 0.16).translate(0, 0.5, Dg / 2), new THREE.BoxGeometry(Wg + 0.2, 0.12, 0.16).translate(0, 0.45 + H * 0.62, Dg / 2));
  g.add(s._shadow(new THREE.Mesh(mergeGeometries(posts), m.mullion)));
  const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(op.color).multiplyScalar(s.clay ? 1 : 2), toneMapped: false, transparent: true, opacity: 0.9 });
  const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(Wg + 0.02, H, Dg + 0.02)); eg.translate(0, 0.45 + H / 2, 0);
  g.add(new THREE.LineSegments(eg, edgeMat));
  // distinct crown per carrier family
  const top = 0.45 + H;
  const crown = [];
  if (fam === 'Tata') { crown.push(new THREE.BoxGeometry(Wg + 0.4, 0.3, Dg + 0.4).translate(0, top + 0.15, 0)); for (const sx of [-1, 1]) crown.push(new THREE.BoxGeometry(0.25, 1.6, Dg * 0.8).translate(sx * (Wg / 2 - 0.4), top + 1.1, 0)); }
  else if (fam === 'Sify') { const r = new THREE.BoxGeometry(Wg + 0.4, 0.3, Dg + 0.6); r.rotateX(-0.18); r.translate(0, top + 0.45, 0); crown.push(r); }
  else if (fam === 'Jio') { crown.push(new RoundedBoxGeometry(Wg + 0.3, 0.9, Dg + 0.3, 4, 0.42).translate(0, top + 0.35, 0)); }
  else { crown.push(new THREE.CylinderGeometry(Dg / 2 + 0.2, Dg / 2 + 0.2, 0.5, 40).scale(Wg / Dg, 1, 1).translate(0, top + 0.25, 0)); }
  crown.push(new THREE.CylinderGeometry(0.04, 0.06, 1.8, 6).translate(Wg / 2 - 0.5, top + 1.3, -Dg / 2 + 0.5));
  g.add(s._shadow(new THREE.Mesh(mergeGeometries(crown.map((c) => (c.index ? c.toNonIndexed() : c))), m.crown)));
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), s.glow(op.color, 3)); beacon.position.set(Wg / 2 - 0.5, top + 2.25, -Dg / 2 + 0.5); g.add(beacon);
  // logo disc on the front
  const disc = s._shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.14, 40).rotateX(Math.PI / 2), m.metalDark)); disc.position.set(0, 0.45 + H * 0.8, Dg / 2 + 0.12); g.add(disc);
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.82, 40), new THREE.MeshBasicMaterial({ map: logoTexture(THREE, op.key), transparent: true, toneMapped: false }));
  logo.position.set(0, 0.45 + H * 0.8, Dg / 2 + 0.2); g.add(logo);
  // status LEDs on the plinth front (blink)
  const leds = [];
  for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#41e0a0').multiplyScalar(2), toneMapped: false })); l.position.set(-1.2 + k * 0.6, 0.3, Dg / 2 + 0.52); g.add(l); leds.push(l); }
  s.updaters.push((t) => { leds.forEach((l, k) => { l.visible = Math.sin(t * (2 + k * 0.7) + i * 1.3) > -0.6; }); beacon.visible = Math.sin(t * 2.6 + i) > -0.3; });
  s._hitBox(g, Wg + 1.2, H + 3, Dg + 1.2, { type: 'operator', key: op.key });
  const card = s.labels?.add(g, [0, top + 2.4 + (i % 3) * 1.4, 0], opCardHtml(op), { cls: 'cc-op mini', priority: 10 + i, anchor: [0.5, 1], clamp: true, onClick: () => s.onSelect({ type: 'operator', key: op.key }) });
  s.islands.set(op.key, { group: g, glowMat, accentMat: glowMat, edgeMat, color: new THREE.Color(op.color), card, center: new THREE.Vector3(x, 0, z), front: new THREE.Vector3(x, 0, z + Dg / 2 + 0.6) });
}

export function opCardHtml(op) {
  return `<div class="h">${logoSvg(op.key, 24)}<span><b>${op.key}</b><small>${op.family || ''} · ${f(op.total)} DIDs</small></span></div>` +
    `<div class="s"><span><i style="background:#22c55e"></i><em>Active</em><b>${f(op.active)}</b></span><span><i style="background:#3b82f6"></i><em>Pool</em><b>${f(op.pool)}</b></span><span><i style="background:#f97316"></i><em>Util.</em><b class="u">${(op.utilization ?? 0).toFixed(1)}%</b></span></div>`;
}

// ---------- trunk bus: gateways → hub, with travelling pulses ----------
function buildBus(s, span) {
  const z = LAYOUT.BUS, [hx, hz] = LAYOUT.hub;
  const bus = new THREE.Mesh(new RoundedBoxGeometry(span + 4, 0.18, 1.1, 2, 0.08), s.mats.lane); bus.position.set(0, 0.09, z); bus.receiveShadow = true; s.scene.add(bus);
  const busGlow = new THREE.Mesh(new THREE.BoxGeometry(span + 4, 0.05, 0.12), s.glow('#ff8a3d', 2.6)); busGlow.position.set(0, 0.2, z); s.scene.add(busGlow);
  const stubs = [], curves = [];
  for (const isl of s.islands.values()) {
    stubs.push(new THREE.BoxGeometry(0.7, 0.12, Math.abs(z - isl.front.z)).translate(isl.front.x, 0.08, (z + isl.front.z) / 2));
    curves.push(new THREE.CatmullRomCurve3([new THREE.Vector3(isl.front.x, 0.45, isl.front.z), new THREE.Vector3(isl.front.x, 0.45, z), new THREE.Vector3(isl.front.x * 0.35, 0.45, z), new THREE.Vector3(hx, 0.45, hz - 8.8)], false, 'catmullrom', 0.1));
  }
  s.scene.add(s._shadow(new THREE.Mesh(mergeGeometries(stubs), s.mats.lane), false, true));
  const main = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.16, Math.abs(hz - 8.8 - z), 2, 0.08), s.mats.lane); main.position.set(0, 0.08, (z + hz - 8.8) / 2); s.scene.add(main);
  const mg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, Math.abs(hz - 8.8 - z)), s.glow('#ff8a3d', 2.6)); mg.position.set(0, 0.18, (z + hz - 8.8) / 2); s.scene.add(mg);
  s.busCurves = [...s.islands.keys()].map((k, i) => ({ key: k, curve: curves[i] }));
  // pulses: a DID leaving a gateway towards the hub
  const N = s.quality === 'low' ? 6 : 12;
  const pm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), N); pm.frustumCulled = false; s.scene.add(pm);
  const slots = Array.from({ length: N }, (_, k) => ({ c: k % curves.length, t0: k * 0.7 }));
  const o = new THREE.Object3D(), keys = [...s.islands.keys()];
  s.updaters.push((t) => {
    slots.forEach((sl, k) => {
      const u = ((t - sl.t0) * 0.22) % 1; if (u < 0 || Number.isNaN(u)) return;
      const ci = s.selected?.type === 'operator' ? keys.indexOf(s.selected.key) : (sl.c + Math.floor((t - sl.t0) * 0.22)) % curves.length;
      const p = curves[Math.max(0, ci)].getPointAt(Math.min(1, Math.max(0, u)));
      o.position.copy(p); o.scale.setScalar(0.7 + Math.sin(u * Math.PI) * 0.5); o.updateMatrix(); pm.setMatrixAt(k, o.matrix);
      pm.setColorAt(k, s.islands.get(keys[Math.max(0, ci)]).color.clone().multiplyScalar(2.4));
    });
    pm.instanceMatrix.needsUpdate = true; if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
  });
  s.poolLabel = s.labels?.add(s.scene, [-span / 2 - 3, 0.3, z + 1.6], `<span class="cc-ico cc-blue"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg></span><span><b>DID Pool</b><small>Available: <span data-k="pool">${f(s.data?.pool)}</span></small></span>`, { cls: 'cc-node', priority: 22, onClick: () => s.onSelect({ type: 'pool' }) });
  s.poolNode = { center: new THREE.Vector3(0, 0, LAYOUT.GZ) };
}

// ---------- UNext Support Team hub ----------
function buildSupportHub(s) {
  const [hx, hz] = LAYOUT.hub, m = s.mats, orange = '#ff7a1a';
  const g = new THREE.Group(); g.position.set(hx, 0, hz); s.scene.add(g);
  const R = 8.6;
  g.add(s._shadow(new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.35, 0.55, 112).translate(0, 0.275, 0), m.metal)));
  for (const [rr, y] of [[R + 0.36, 0.12], [R - 0.9, 0.57], [3.4, 0.57]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.07, 6, 180), s.glow(orange, 3)); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring); }
  const deck = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 112), new THREE.MeshStandardMaterial({ color: s.clay ? '#ffffff' : '#f4f5f7', roughness: 0.22, metalness: 0.2 })); deck.rotation.x = -Math.PI / 2; deck.position.y = 0.56; deck.receiveShadow = true; g.add(deck);
  // curved glass balustrade with an entry gap facing the status path
  const bal = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.25, R - 0.25, 1.1, 112, 1, true, 0.5, Math.PI * 2 - 1.0), m.vaultGlass); bal.position.y = 1.1; bal.rotation.y = Math.PI / 2; g.add(bal);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(R - 0.25, 0.06, 6, 140, Math.PI * 2 - 1.0), m.mullion); rail.rotation.x = Math.PI / 2; rail.rotation.z = Math.PI / 2 + 0.5; rail.position.y = 1.66; g.add(rail);
  // ring desk with monitors (support staff face the core)
  const desk = arcSlab(4.3, 5.1, 0.35, Math.PI * 2 - 0.35, 0.1, 1.38).rotateY(Math.PI / 2);
  const ped = arcSlab(4.45, 4.95, 0.4, Math.PI * 2 - 0.4, 0.82, 0.56).rotateY(Math.PI / 2);
  g.add(s._shadow(new THREE.Mesh(mergeGeometries([desk, ped]), m.white)));
  const scr = screenTexture('#ff9a4d'); scr.wrapT = THREE.RepeatWrapping; s.screens.push(scr);
  const monMat = new THREE.MeshStandardMaterial({ color: '#111', emissiveMap: scr, emissive: '#ffffff', emissiveIntensity: s.clay ? 0.3 : 1.6 });
  const nS = 7, monitors = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.5, 0.05), monMat, nS); g.add(monitors);
  const o = new THREE.Object3D();
  for (let k = 0; k < nS; k++) {
    const a = Math.PI / 2 + 0.6 + (k / (nS - 1)) * (Math.PI * 2 - 1.2);
    const cx = Math.cos(a), cz = Math.sin(a);
    o.position.set(cx * 4.55, 1.78, cz * 4.55); o.lookAt(cx * 10, 1.78, cz * 10); o.updateMatrix(); monitors.setMatrixAt(k, o.matrix);
    s.crowd.add({ x: hx + cx * 5.75, z: hz + cz * 5.75, y: 0.56, yaw: Math.atan2(-cx, -cz), pose: 'sit', shirt: '#f26b1d', pants: '#2b2f38', speed: 0.9 + k * 0.05 });
    chairAt(s, hx + cx * 6.05, hz + cz * 6.05, 0.56, Math.atan2(-cx, -cz));
  }
  // core
  g.add(s._shadow(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.7, 64).translate(0, 0.91, 0), m.metalDark)));
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3.4, 48, 1, true), new THREE.MeshStandardMaterial({ color: '#ffb36b', emissive: '#ff6a00', emissiveIntensity: s.clay ? 0.4 : 1.2, transparent: true, opacity: 0.85, roughness: 0.1, side: THREE.DoubleSide }));
  core.position.y = 2.95; g.add(core);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.2, 32).translate(0, 2.95, 0), s.glow('#ffc27a', 1.1)));
  const ribs = []; for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ribs.push(new THREE.BoxGeometry(0.08, 3.4, 0.12).translate(Math.cos(a) * 1.64, 2.95, Math.sin(a) * 1.64)); }
  g.add(new THREE.Mesh(mergeGeometries(ribs), m.mullion));
  if (!s.clay) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.6, 5, 48, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a3d').multiplyScalar(1.5), alphaMap: beamTexture(), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    beam.rotation.x = Math.PI; beam.position.y = 3.2; g.add(beam);
  }
  const arcs = [];
  for (let k = 0; k < 3; k++) { const a = new THREE.Mesh(new THREE.TorusGeometry(2.3 + k * 0.35, 0.06, 8, 80, Math.PI * (0.6 + k * 0.15)), s.glow('#ff8a2a', 3)); a.position.y = 1.5 + k * 1.15; a.rotation.x = Math.PI / 2; g.add(a); arcs.push(a); }
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.25, 48, 32), new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff5a00', emissiveIntensity: s.clay ? 0.5 : 1.1, roughness: 0.2 })); orb.position.y = 5.8; g.add(orb);
  const glyph = new THREE.Sprite(new THREE.SpriteMaterial({ map: phoneGlyphTexture(), transparent: true, depthTest: false })); glyph.scale.set(1.5, 1.5, 1); glyph.position.y = 5.8; glyph.renderOrder = 5; g.add(glyph);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ff8a3d'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: s.clay ? 0.3 : 0.55 })); halo.scale.set(6, 6, 1); halo.position.y = 5.7; g.add(halo);
  // suspended ceiling rings (like the round lounge)
  for (const [rr, mat, y] of [[6.4, m.ceilDark, 8.8], [5.4, m.ceilLight, 8.6]]) { const c = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.32, 10, 140), mat); c.rotation.x = Math.PI / 2; c.position.y = y; g.add(c); }
  const lights = new THREE.Mesh(new THREE.TorusGeometry(5.9, 0.05, 6, 140), s.glow('#fff1df', 2)); lights.rotation.x = Math.PI / 2; lights.position.y = 8.45; g.add(lights);
  const pl = new THREE.PointLight('#ff8a3d', (s.clay ? 25 : 100) * s.L, 24, 2); pl.position.y = 4; g.add(pl);
  s.updaters.push((t) => {
    arcs.forEach((a, k) => { a.rotation.z = t * (0.4 + k * 0.18) * (k % 2 ? -1 : 1); });
    orb.position.y = glyph.position.y = 5.8 + Math.sin(t * 1.4) * 0.18;
    halo.material.opacity = (s.clay ? 0.28 : 0.5) + Math.sin(t * 2) * 0.08;
  });
  s._hit(g, R, 9, { type: 'hub' });
  s.hubLabel = s.labels?.add(g, [0, 10.2, 0], `<b>UNext Support Team</b><small>Replaces DIDs · Total <span data-k="total">${f(s.data?.total)}</span></small>`, { cls: 'cc-hub', priority: 5, anchor: [0.5, 1], onClick: () => s.onSelect({ type: 'hub' }) });
  s.hub = { group: g, center: new THREE.Vector3(hx, 0, hz) };
}

// chairs (instanced, collected then built once)
const chairs = [];
function chairAt(s, x, z, y, yaw) { chairs.push([x, z, y, yaw]); }
function buildChairs(s) {
  const n = chairs.length; if (!n) return;
  const seat = s._shadow(new THREE.InstancedMesh(new RoundedBoxGeometry(0.55, 0.1, 0.55, 2, 0.04), s.mats.chair, n));
  const back = s._shadow(new THREE.InstancedMesh(new RoundedBoxGeometry(0.52, 0.6, 0.08, 2, 0.04), s.mats.chair, n));
  const stem = s._shadow(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 6), s.mats.metal, n));
  const base = s._shadow(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 5), s.mats.metalDark, n));
  const o = new THREE.Object3D();
  chairs.forEach(([x, z, y, yaw], i) => {
    o.rotation.set(0, yaw, 0);
    o.position.set(x, y + 0.5, z); o.updateMatrix(); seat.setMatrixAt(i, o.matrix);
    o.position.set(x - Math.sin(yaw) * 0.27, y + 0.85, z - Math.cos(yaw) * 0.27); o.updateMatrix(); back.setMatrixAt(i, o.matrix);
    o.position.set(x, y + 0.25, z); o.updateMatrix(); stem.setMatrixAt(i, o.matrix);
    o.position.set(x, y + 0.03, z); o.updateMatrix(); base.setMatrixAt(i, o.matrix);
  });
  s.scene.add(seat, back, stem, base);
  chairs.length = 0;
}

// ---------- agent desk rows ----------
function buildAgentRows(s) {
  const A = LAYOUT.agents, m = s.mats;
  const rows = [A.z0 + 2.6, A.z0 + 7.4, A.z0 + 12.2];
  const len = A.x1 - A.x0 - 2, cx = (A.x0 + A.x1) / 2, per = 5;
  const deskG = [], partG = [], legs = [];
  const scr = screenTexture('#41e0a0'); scr.wrapT = THREE.RepeatWrapping; s.screens.push(scr);
  const monMat = new THREE.MeshStandardMaterial({ color: '#0d1420', emissiveMap: scr, emissive: '#ffffff', emissiveIntensity: s.clay ? 0.3 : 1.6, roughness: 0.3 });
  const mons = [], lights = [];
  rows.forEach((rz, ri) => {
    deskG.push(new RoundedBoxGeometry(len, 0.08, 1.7, 2, 0.03).translate(cx, 1.0, rz));
    for (const lx of [cx - len / 2 + 0.4, cx, cx + len / 2 - 0.4]) legs.push(new THREE.BoxGeometry(0.08, 0.96, 1.5).translate(lx, 0.5, rz));
    partG.push(new THREE.BoxGeometry(len, 0.55, 0.06).translate(cx, 1.32, rz));
    for (let k = 0; k < per; k++) {
      const x = A.x0 + 2 + k * ((len - 2) / (per - 1));
      for (const sd of [-1, 1]) {
        const yaw = sd < 0 ? 0 : Math.PI;
        mons.push([x, rz + sd * 0.35, yaw + Math.PI]);
        s.crowd.add({ x, z: rz + sd * 1.25, yaw, pose: 'sit', shirt: ['#eef2f6', '#dbe7f5', '#f3efe8', '#e5eef0'][(k + ri) % 4], pants: '#2d3442' });
        chairAt(s, x, rz + sd * 1.55, 0, yaw);
        s.seats.push(new THREE.Vector3(x, 1.9, rz + sd * 1.1));
      }
      lights.push(new THREE.Vector3(x, 1.75, rz));
    }
  });
  s.scene.add(s._shadow(new THREE.Mesh(mergeGeometries(deskG), m.white)));
  s.scene.add(s._shadow(new THREE.Mesh(mergeGeometries(legs), m.metal)));
  s.scene.add(s._shadow(new THREE.Mesh(mergeGeometries(partG), m.partition)));
  const mi = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.45, 0.04), monMat, mons.length), o = new THREE.Object3D();
  mons.forEach(([x, z, yaw], i) => { o.position.set(x, 1.33, z); o.rotation.set(-0.08, yaw, 0); o.updateMatrix(); mi.setMatrixAt(i, o.matrix); });
  mi.castShadow = true; s.scene.add(mi);
  // status lights above each desk pod: green = idle, amber = request raised, blue = DID being replaced
  const sl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), lights.length);
  lights.forEach((p, i) => { o.position.copy(p); o.rotation.set(0, 0, 0); o.updateMatrix(); sl.setMatrixAt(i, o.matrix); });
  s.scene.add(sl);
  const cols = [new THREE.Color('#22c55e').multiplyScalar(2.2), new THREE.Color('#f5a524').multiplyScalar(2.4), new THREE.Color('#3b82f6').multiplyScalar(2.4)];
  s.updaters.push((t) => { if ((s._slF = (s._slF || 0) + 1) % 10) return; lights.forEach((_, i) => { const v = Math.sin(t * 0.6 + i * 2.17); sl.setColorAt(i, cols[v > 0.75 ? 1 : v < -0.85 ? 2 : 0]); }); if (sl.instanceColor) sl.instanceColor.needsUpdate = true; });
  s._hitBox(s.scene, A.x1 - A.x0 + 2, 6, A.z1 - A.z0 + 2, { type: 'agents' }, new THREE.Vector3(cx, 0, (A.z0 + A.z1) / 2));
  s.agentLabel = s.labels?.add(s.scene, [cx, 0.3, A.z1 + 2.4], `<span class="cc-ico cc-indigo"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2"><path d="M3 11a9 9 0 0 1 18 0v5a2 2 0 0 1-2 2h-1v-6h3M3 11v5a2 2 0 0 0 2 2h1v-6H3"/></svg></span><span><b>Agents</b><small>Total: <span data-k="agents">${f(s.data?.agents)}</span> · raise DID requests</small></span>`, { cls: 'cc-node', priority: 21, onClick: () => s.onSelect({ type: 'agents' }) });
  s.agentNode = { center: new THREE.Vector3(cx, 0, (A.z0 + A.z1) / 2) };
}

// ---------- collaboration lounge (team huddle) ----------
function buildLounge(s) {
  const [x, z] = LAYOUT.lounge, m = s.mats;
  const g = new THREE.Group(); g.position.set(x, 0, z); s.scene.add(g);
  g.add(s._shadow(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.08, 40).translate(0, 1.05, 0), m.wood)));
  g.add(s._shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 1.0, 16).translate(0, 0.5, 0), m.metal)));
  // whiteboard / screen showing a plain chart
  const wb = s._shadow(new THREE.Mesh(new RoundedBoxGeometry(4.6, 2.6, 0.12, 2, 0.05), m.white)); wb.position.set(0, 2.2, -4); g.add(wb);
  const chart = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.2), new THREE.MeshBasicMaterial({ map: chartTexture() })); chart.position.set(0, 2.2, -3.93); g.add(chart);
  for (const sx of [-1.9, 1.9]) g.add(s._shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0).translate(sx, 0.5, -4), m.metal)));
  // three colleagues in conversation around the table + two at the board
  const ring = [[0, 2.1], [1.8, -1.1], [-1.8, -1.1]];
  ring.forEach(([px, pz], k) => s.crowd.add({ x: x + px, z: z + pz, yaw: Math.atan2(-px, -pz), pose: 'talk', shirt: ['#f26b1d', '#dbe7f5', '#e8f1ea'][k], pants: '#2b2f38', speed: 0.8 + k * 0.2 }));
  s.crowd.add({ x: x - 0.9, z: z - 2.9, yaw: Math.PI, pose: 'talk', shirt: '#eef2f6', speed: 1.1 });
  // sofas + plants
  const sofa = [];
  for (const [sx, sz, r] of [[-5, 3, 0.4], [5, 3, -0.4]]) { const b = new RoundedBoxGeometry(3.2, 0.7, 1.2, 3, 0.25); b.rotateY(r); b.translate(sx, 0.35, sz); sofa.push(b); }
  g.add(s._shadow(new THREE.Mesh(mergeGeometries(sofa), m.partition)));
  for (const [px, pz] of [[-6.5, -4], [6.5, -4], [-7, 5], [7, 5]]) s.plants.push([x + px, z + pz]);
  s._hitBox(g, 14, 4, 11, { type: 'team' });
}
function chartTexture() {
  const c = document.createElement('canvas'); c.width = 420; c.height = 220; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 420, 220);
  [60, 110, 85, 150, 120, 170].forEach((v, i) => { g.fillStyle = i % 2 ? '#f26b1d' : '#2a6fdb'; g.fillRect(40 + i * 58, 190 - v, 36, v); });
  g.strokeStyle = '#c9cfd8'; g.lineWidth = 2; g.beginPath(); g.moveTo(30, 190); g.lineTo(400, 190); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- a few walkers between zones ----------
function buildWalkers(s) {
  const [hx, hz] = LAYOUT.hub, A = LAYOUT.agents;
  const loops = [
    [[hx + 9.5, hz - 1], [A.x0 - 1.5, A.z0 + 0.5], [A.x0 - 1.5, A.z1 + 0.5], [hx + 9.5, hz + 8]],
    [[-12, -6], [-12, 8], [-18, 9], [-18, -6]],
    [[-6, LAYOUT.BUS + 2.2], [12, LAYOUT.BUS + 2.2], [14, -3], [-4, -3]],
    [[A.x0 + 1, A.z1 + 1.5], [A.x1 - 1, A.z1 + 1.5], [A.x1 - 1, A.z0 - 1], [A.x0 + 1, A.z0 - 1]]
  ];
  const n = s.quality === 'low' ? 2 : loops.length;
  for (let k = 0; k < n; k++) s.crowd.add({ pose: 'walk', path: loops[k], x: 0, z: 0, shirt: ['#f26b1d', '#dbe7f5', '#eef2f6', '#e8f1ea'][k], pants: '#2b2f38', speed: 0.8 + k * 0.12, phase: k * 2.3 });
  buildChairs(s);
}

// ---------- call-routing arcs: hub → agent desk (illustrative) ----------
function buildCallRoutes(s) {
  if (!s.seats.length) return;
  const [hx, hz] = LAYOUT.hub, from = new THREE.Vector3(hx, 6.2, hz);
  const N = s.quality === 'low' ? 2 : 4, routes = [];
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ab0ff').multiplyScalar(2), transparent: true, opacity: 0.0, toneMapped: false, depthWrite: false });
  for (let k = 0; k < N; k++) {
    const tube = new THREE.Mesh(new THREE.BufferGeometry(), lineMat.clone()); s.scene.add(tube); s.noReflect.push(tube);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd4ff').multiplyScalar(2.6), toneMapped: false })); s.scene.add(dot);
    routes.push({ tube, dot, start: -k * 1.1, curve: null });
  }
  const r = rng(77);
  s.updaters.push((t) => {
    for (const rt of routes) {
      const u = (t - rt.start) / 2.4;
      if (!rt.curve || u >= 1) {
        rt.start = t + r() * 0.6;
        const to = s.seats[Math.floor(r() * s.seats.length)];
        const mid = from.clone().lerp(to, 0.5).setY(9);
        rt.curve = new THREE.QuadraticBezierCurve3(from, mid, to);
        rt.tube.geometry.dispose(); rt.tube.geometry = new THREE.TubeGeometry(rt.curve, 40, 0.045, 5);
        continue;
      }
      if (u < 0) { rt.dot.visible = false; rt.tube.material.opacity = 0; continue; }
      rt.dot.visible = true; rt.dot.position.copy(rt.curve.getPointAt(Math.min(1, u)));
      rt.tube.material.opacity = Math.sin(Math.min(1, u) * Math.PI) * 0.7;
    }
  });
}
