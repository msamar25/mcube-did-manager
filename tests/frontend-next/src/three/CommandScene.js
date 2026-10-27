// DID Command Center — real-time Three.js scene (v2).
// Everything is modelled procedurally in ./parts: operator islands, the MCube hub, the DID pool vault,
// the agent operations island, the replacement ticket board, network lanes and the environment.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { facadeTextures, rackTextures, contactShadowTexture, laneTexture } from './textures.js';
import { LabelLayer } from './labels.js';
import { buildLights, buildPlants } from './parts/environment.js';
import { buildOffice, opCardHtml, LAYOUT } from './parts/office.js';
import { buildTicketBoard } from './parts/ticketBoard.js';
import { buildLinks } from './parts/links.js';
import './scene.css';

const VIEWS = {
  '3d': { pos: [0, 44, 54], target: [0, 1, 2] },
  '2d': { pos: [0, 86, 0.01], target: [0, 0, 0] },
  clay: { pos: [-40, 56, 64], target: [8, 0, 3] }
};
// Lights are scaled down by L and exposure scaled up by 1/L so only emissive accents exceed the bloom threshold.
const L = 1 / 2.2;

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv; void main(){ vec4 c=texture2D(tDiffuse,vUv); vec2 d=vUv-0.5; float v=1.0-dot(d,d)*uAmount*2.2; gl_FragColor=vec4(c.rgb*clamp(v,0.0,1.0),c.a); }'
};

export class CommandScene {
  constructor(container, opts = {}) {
    this.el = container;
    this.theme = opts.theme || 'default';
    this.clay = this.theme === 'clay';
    this.onSelect = opts.onSelect || (() => {});
    this.interactive = opts.interactive !== false;
    this.labelsOn = opts.labels !== false && !this.clay;
    this.reserve = opts.reserve || '';
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 || Math.min(innerWidth, innerHeight) < 600;
    this.quality = opts.quality === 'low' || (opts.quality !== 'high' && lowPower) ? 'low' : 'high';
    this.L = L;
    this.clock = new THREE.Clock();
    this.updaters = [];
    this.hitTargets = [];
    this.islands = new Map();
    this.trees = [];
    this.lamps = [];
    this.reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.plants = [];
    this.noReflect = [];
    this.selected = null;
    this.tween = null;
    this.visible = true;
    this.disposed = false;
    this.data = opts.data;
    this._init();
  }

  _init() {
    const { el } = this;
    const w = el.clientWidth || 800, h = el.clientHeight || 500;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality === 'low' ? 1.25 : 1.75));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = (this.clay ? 1.05 : 1.0) / L;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'cc-canvas';
    el.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const bg = new THREE.Color(this.clay ? '#dfe8f5' : '#d7dce4');
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 140, 300);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = (this.clay ? 0.55 : 0.5) * L;
    pmrem.dispose();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(this.clay ? 30 : 36, w / h, 0.5, 420);
    const v = VIEWS[this.clay ? 'clay' : '3d'];
    camera.position.set(...v.pos);
    this.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...v.target);
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, minDistance: 22, maxDistance: 125, maxPolarAngle: 1.3, minPolarAngle: 0, screenSpacePanning: false, zoomSpeed: 0.8, rotateSpeed: 0.55, enabled: this.interactive });
    controls.addEventListener('start', () => { this.tween = null; this._userMoved = true; this.el.dispatchEvent(new CustomEvent('cc-interact', { bubbles: true })); });
    this.controls = controls;

    buildLights(this);

    // post-processing: MSAA target, bloom on emissive accents only, vignette, output
    if (this.quality === 'high' && !this.clay) {
      const pr = renderer.getPixelRatio();
      const dbg = new URLSearchParams(location.search);
      const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: dbg.has('nomsaa') ? 0 : 2 }); // 2x MSAA: reflector + 4x MSAA is too heavy for weak GPUs
      const composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.42, 1.0);
      composer.addPass(this.bloom);
      composer.addPass(new ShaderPass(VignetteShader));
      composer.addPass(new OutputPass());
      composer.setSize(w, h);
      this.composer = composer;
    }

    if (this.labelsOn) {
      const lr = new CSS2DRenderer();
      lr.setSize(w, h);
      lr.domElement.className = 'cc-labels';
      el.appendChild(lr.domElement);
      this.labelRenderer = lr;
      this.labels = new LabelLayer(el, { reserve: this.reserve });
    }

    this.mats = this._materials();
    buildOffice(this, w, h);
    const H = LAYOUT.hub, hub = { x: H[0], z: H[1], r: 8.6 };
    buildTicketBoard(this, [[-11, 17], [-3.7, 19.3], [3.7, 19.3], [11, 17]]); // boards side by side, like columns on a ticket wall
    buildLinks(this, [{ from: { x: LAYOUT.agents.x0 - 0.5, z: LAYOUT.agents.z0 + 2.6, r: 0 }, to: hub, color: '#22c55e', bend: -0.08 }]);
    buildPlants(this, [[-35, -21], [35, -21], [-35, 22], [36, 3], [-14, -4], [14, -4], ...this.plants]);
    this.fitCamera();

    // interaction
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    if (this.interactive) {
      this._onMove = (e) => this._pointer(e, false);
      this._onDown = (e) => { this._downAt = [e.clientX, e.clientY]; };
      this._onUp = (e) => this._pointer(e, true);
      renderer.domElement.addEventListener('pointermove', this._onMove);
      renderer.domElement.addEventListener('pointerdown', this._onDown);
      renderer.domElement.addEventListener('pointerup', this._onUp);
    } else if (this.clay) {
      this._parallax = { x: 0, y: 0 };
      this._onParallax = (e) => { const r = el.getBoundingClientRect(); this._parallax.x = ((e.clientX - r.left) / r.width - 0.5) * 2; this._parallax.y = ((e.clientY - r.top) / r.height - 0.5) * 2; };
      window.addEventListener('pointermove', this._onParallax, { passive: true });
      this._basePos = camera.position.clone();
    }

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(el);
    this._io = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; });
    this._io.observe(el);
    this._vis = () => { if (!document.hidden) this.clock.getDelta(); };
    document.addEventListener('visibilitychange', this._vis);
    renderer.setAnimationLoop(() => this._frame());
  }

  _materials() {
    const c = this.clay;
    const office = facadeTextures(c ? 'clay' : 'office', 7, !c);
    const glass = facadeTextures(c ? 'clay' : 'glass', 19, !c);
    const mk = (t, extra = {}) => new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: c ? '#000' : '#ffffff', emissiveIntensity: c ? 0 : 0.9, roughness: 0.45, metalness: 0.15, ...extra });
    const rack = rackTextures();
    const contact = contactShadowTexture();
    const lane = laneTexture();
    return {
      office: mk(office),
      glass: mk(glass, { roughness: 0.12, metalness: 0.6, envMapIntensity: 1.6 }),
      trim: new THREE.MeshStandardMaterial({ color: c ? '#ffffff' : '#e3e6eb', roughness: 0.35, metalness: 0.5 }),
      fin: new THREE.MeshStandardMaterial({ color: c ? '#f4f6f9' : '#cfd4db', roughness: 0.3, metalness: 0.8 }),
      lobby: new THREE.MeshStandardMaterial({ color: '#2b3442', emissive: c ? '#000' : '#ffcf8f', emissiveIntensity: c ? 0 : 0.55, roughness: 0.15, metalness: 0.5 }),
      plaza: new THREE.MeshStandardMaterial({ color: c ? '#ffffff' : '#eef0f3', roughness: 0.6 }),
      stone: new THREE.MeshStandardMaterial({ color: '#e7dccb', roughness: 0.7 }),
      metalDark: new THREE.MeshStandardMaterial({ color: c ? '#dfe5ee' : '#353b46', roughness: 0.32, metalness: c ? 0.1 : 0.8 }),
      metal: new THREE.MeshStandardMaterial({ color: c ? '#ffffff' : '#c9ced6', roughness: 0.25, metalness: c ? 0.1 : 0.85 }),
      lawn: new THREE.MeshStandardMaterial({ color: c ? '#e6efe4' : '#78a85a', roughness: 0.95 }),
      roof: new THREE.MeshStandardMaterial({ color: c ? '#ffffff' : '#a3aab5', roughness: 0.5, metalness: 0.45 }),
      lane: new THREE.MeshStandardMaterial({ map: lane, color: c ? '#eef2f8' : '#ffffff', roughness: 0.28, metalness: 0.55 }),
      rack: new THREE.MeshStandardMaterial({ map: rack.map, emissiveMap: rack.emissive, emissive: '#ffffff', emissiveIntensity: c ? 0.2 : 1.8, roughness: 0.4, metalness: 0.6 }),
      disk: new THREE.MeshStandardMaterial({ color: c ? '#eef3fb' : '#1d3557', roughness: 0.25, metalness: 0.7, emissive: c ? '#000' : '#1a4fa0', emissiveIntensity: 0.35 }),
      white: new THREE.MeshStandardMaterial({ color: '#f5f6f8', roughness: 0.45 }),
      partition: new THREE.MeshStandardMaterial({ color: '#f0602a', roughness: 0.75 }),
      dark: new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.6 }),
      shirt: new THREE.MeshStandardMaterial({ color: c ? '#ffffff' : '#eef5f7', roughness: 0.7 }),
      skin: new THREE.MeshStandardMaterial({ color: '#c69873', roughness: 0.8 }),
      hair: new THREE.MeshStandardMaterial({ color: '#2a211c', roughness: 0.9 }),
      foliage: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
      trunk: new THREE.MeshStandardMaterial({ color: c ? '#d9cfc4' : '#7a5a3c', roughness: 1 }),
      slab: new THREE.MeshStandardMaterial({ color: c ? '#e9eef5' : '#3a404b', roughness: 0.3, metalness: c ? 0.1 : 0.75 }),
      wall: new THREE.MeshStandardMaterial({ color: c ? '#ffffff' : '#f4f5f7', roughness: 0.6 }),
      column: new THREE.MeshStandardMaterial({ color: '#fbfbfc', roughness: 0.4 }),
      vaultGlass: new THREE.MeshPhysicalMaterial({ color: c ? '#eef4ff' : '#cfe2ff', transparent: true, opacity: c ? 0.2 : 0.16, roughness: 0.04, metalness: 0, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 }),
      ceilDark: new THREE.MeshStandardMaterial({ color: '#2a2f38', roughness: 0.4, metalness: 0.5 }),
      ceilLight: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
      chair: new THREE.MeshStandardMaterial({ color: '#2d323c', roughness: 0.6 }),
      shirtOrange: new THREE.MeshStandardMaterial({ color: '#f26b1d', roughness: 0.7 }),
      brandRed: new THREE.MeshStandardMaterial({ color: '#e8432d', roughness: 0.35, metalness: 0.1, emissive: c ? '#000' : '#e8432d', emissiveIntensity: 0.25 }),
      wood: new THREE.MeshStandardMaterial({ color: '#d9b98c', roughness: 0.7 }),
      pot: new THREE.MeshStandardMaterial({ color: '#f5f5f4', roughness: 0.5 }),
      mullion: new THREE.MeshStandardMaterial({ color: c ? '#f2f4f7' : '#c4cad3', roughness: 0.25, metalness: 0.85 }),
      crown: new THREE.MeshStandardMaterial({ color: c ? '#ffffff' : '#e8ebef', roughness: 0.3, metalness: 0.6 }),
      cloth: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }),
      pants: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
      skinI: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }),
      hairI: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }),
      shoe: new THREE.MeshStandardMaterial({ color: '#1d2129', roughness: 0.5 }),
      contact: new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false, color: '#000000', opacity: c ? 0.35 : 0.6 })
    };
  }

  glow(color, intensity = 2.2) {
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(this.clay ? 0.9 : intensity), toneMapped: false });
  }
  _shadow(o, cast = true, receive = true) { o.castShadow = cast; o.receiveShadow = receive; return o; }
  _hit(group, R, height, payload) {
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.8, R + 0.8, height, 24), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = height / 2; hit.userData = payload; group.add(hit); this.hitTargets.push(hit);
  }

  _hitBox(group, w, h, d, payload, at) {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(at ? at.x : 0, h / 2, at ? at.z : 0); hit.userData = payload; group.add(hit); this.hitTargets.push(hit);
  }

  // -------- interaction --------
  _pointer(e, click) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const payload = this.raycaster.intersectObjects(this.hitTargets, false)[0]?.object.userData || null;
    if (click) {
      if (this._downAt && Math.hypot(e.clientX - this._downAt[0], e.clientY - this._downAt[1]) > 6) return;
      this.onSelect(payload || { type: 'none' });
    } else {
      const key = payload ? payload.type + ':' + (payload.key || '') : null;
      if (key !== this._hovered) {
        this._hovered = key;
        this.renderer.domElement.style.cursor = payload ? 'pointer' : 'grab';
        for (const [k, isl] of this.islands) isl.card?.classList.toggle('hover', payload?.type === 'operator' && payload.key === k);
      }
    }
  }

  select(sel) {
    this.selected = sel;
    for (const [key, isl] of this.islands) {
      const on = sel?.type === 'operator' && sel.key === key;
      const dim = sel?.type === 'operator' && !on;
      isl.glowMat.color.copy(isl.color).multiplyScalar(on ? 4 : dim ? 0.9 : 2.4);
      isl.accentMat.color.copy(isl.color).multiplyScalar(on ? 4 : dim ? 1 : 2.6);
      if (isl.edgeMat) isl.edgeMat.opacity = dim ? 0.35 : 0.9;
      isl.card?.classList.toggle('on', on); isl.card?.classList.toggle('dim', dim);
      const lm = this.linkMats?.get(key);
      if (lm) lm.uniforms.uSpeed.value = on ? 1.2 : 0.45;
    }
    this.labels?.update(true);
    const f = this._fit || 1;
    const wasFocused = this._focused; this._focused = !!sel && sel.type !== 'none';
    if (!this._focused) { if (wasFocused) { this._userMoved = false; this.setView(this.view || '3d'); } return; }
    const topDown = this.view === '2d';
    const focus = (c, y, back, side = 0) => this.flyTo(c.clone().setY(y).add(new THREE.Vector3(topDown ? 0 : -7 * f, 0, 0)), topDown ? new THREE.Vector3(c.x, 64 * f, c.z + 0.01) : c.clone().add(new THREE.Vector3(side - 7 * f, back * 0.82 * f, back * f)));
    if (sel.type === 'operator') { const isl = this.islands.get(sel.key); if (isl) focus(isl.center, 3, 30, isl.center.x * 0.15); }
    else if (sel.type === 'team') focus(new THREE.Vector3(-25, 0, 15), 1, 26, 3);
    else if (sel.type === 'pool') focus(this.poolNode.center, 3, 40);
    else if (sel.type === 'agents') focus(this.agentNode.center, 1, 40, 4);
    else if (sel.type === 'flow' && sel.key && this.boards?.some((b) => b.col.key === sel.key)) { const b = this.boards.find((x) => x.col.key === sel.key); const nrm = new THREE.Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw)); this.flyTo(b.center.clone(), b.center.clone().add(nrm.multiplyScalar(12.5)).add(new THREE.Vector3(0, 2.2, 0))); } // straight in front of the board, close enough to read its tickets
    else if (sel.type === 'flow') focus(new THREE.Vector3(4, 0, 16), 1, 40);
    else if (sel.type === 'hub') focus(this.hub.center, 3, 42);
  }

  flyTo(target, pos, dur = 1.2) {
    this.tween = { t: 0, dur, t0: performance.now(), fromT: this.controls.target.clone(), fromP: this.camera.position.clone(), toT: target, toP: pos };
  }

  setView(view) {
    const v = VIEWS[view] || VIEWS['3d'];
    this.view = view;
    this.controls.enableRotate = view !== '2d';
    this.controls.maxPolarAngle = view === '2d' ? 0.001 : 1.3;
    if (this._focused && this.selected) { this._focused = false; return this.select(this.selected); }
    const pos = new THREE.Vector3(...v.pos);
    if (view === '3d') pos.sub(new THREE.Vector3(...v.target)).multiplyScalar(this._fit || 1).add(new THREE.Vector3(...v.target));
    this.flyTo(new THREE.Vector3(...v.target), pos);
  }

  resetView() { this._userMoved = false; this._focused = false; this.select(null); this.setView(this.view || '3d'); }
  setAutoRotate(on) { this.autoRotate = on; }

  setData(data) {
    this.data = data;
    this.updateBoards?.(data); // 3D ticket boards (canvas), independent of HTML labels
    if (!this.labelsOn) return;
    for (const op of data.operators || []) { const isl = this.islands.get(op.key); if (isl?.card) isl.card.innerHTML = opCardHtml(op); }
    const set = (root, k, v) => { const n = root?.querySelector(`[data-k="${k}"]`); if (n) n.textContent = Number(v ?? 0).toLocaleString('en-IN'); };
    set(this.hubLabel, 'total', data.total); set(this.poolLabel, 'pool', data.pool); set(this.agentLabel, 'agents', data.agents);
  }

  fitCamera() {
    const aspect = this.camera.aspect;
    const k = aspect < 1.6 ? Math.min(2.3, 1.6 / Math.max(aspect, 0.45)) : 1;
    this._fit = Math.min(k, 1.3);
    if (!this.clay) {
      this.camera.fov = (2 * Math.atan(Math.tan((36 * Math.PI) / 360) * (k / this._fit)) * 180) / Math.PI;
      this.camera.updateProjectionMatrix();
      this.scene.fog.near = 110 * this._fit; this.scene.fog.far = 230 * this._fit;
    }
    this.controls.maxDistance = 125 * this._fit;
    // compact labels on small stages
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.labels?.setCompact(w < 1250 || h < 520);
    if (this.clay) {
      this.camera.position.set(...VIEWS.clay.pos).multiplyScalar(aspect < 1.2 ? 1.6 : 1);
      this._basePos = this.camera.position.clone();
      return;
    }
    if (this._userMoved || (this.view || '3d') !== '3d') return;
    const v = VIEWS['3d'], t = new THREE.Vector3(...v.target);
    const p = new THREE.Vector3(...v.pos).sub(t).multiplyScalar(this._fit).add(t);
    if (this.tween) this.tween.toP = p; else this.camera.position.copy(p);
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.labelRenderer?.setSize(w, h);
    if (this.mirror) { const pr = this.renderer.getPixelRatio(); this.mirror.getRenderTarget().setSize(Math.round(w * pr * 0.5), Math.round(h * pr * 0.5)); }
    this.fitCamera();
  }

  _frame() {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.visible || this.paused || document.hidden) return;
    this.time = (this.time || 0) + dt;
    const t = this.time;
    for (const u of this.updaters) u(this.reduced ? 1 : t, this.reduced ? 0 : dt); // reduced motion: scene holds still
    if (this.tween) {
      // wall-clock progress, so slow devices still arrive on time
      const tw = this.tween; tw.t = Math.min(1, (performance.now() - tw.t0) / (tw.dur * 1000));
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      this.controls.target.lerpVectors(tw.fromT, tw.toT, e);
      this.camera.position.lerpVectors(tw.fromP, tw.toP, e);
      if (tw.t >= 1) this.tween = null;
    }
    if (this.autoRotate && !this.tween) {
      const p = this.camera.position.clone().sub(this.controls.target);
      p.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.08);
      this.camera.position.copy(this.controls.target).add(p);
    }
    if (this._parallax && this._basePos) {
      const goal = this._basePos.clone().add(new THREE.Vector3(this._parallax.x * 3, -this._parallax.y * 1.5, 0));
      this.camera.position.lerp(goal, 0.04);
      this.camera.lookAt(this.controls.target);
    }
    this.controls.update();
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    if (this.labelRenderer) { this.labelRenderer.render(this.scene, this.camera); this.labels.update(!!this.tween); }
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this._ro?.disconnect(); this._io?.disconnect();
    document.removeEventListener('visibilitychange', this._vis);
    if (this._onParallax) window.removeEventListener('pointermove', this._onParallax);
    this.controls.dispose();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }
    });
    this.mirror?.dispose?.();
    this.composer?.dispose?.();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer?.domElement.remove();
  }
}
