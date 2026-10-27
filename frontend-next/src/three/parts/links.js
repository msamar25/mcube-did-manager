// Network lanes: glossy chevron lane, neon edges, an animated light core and glowing data packets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ribbon } from '../geometry.js';

export function buildLinks(s, nodes) {
  const flowMat = (color, speed) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uSpeed: { value: speed }, uBoost: { value: s.clay ? 0.8 : 2.4 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime; uniform vec3 uColor; uniform float uSpeed; uniform float uBoost; varying vec2 vUv; void main(){ float s=fract(vUv.x*0.35-uTime*uSpeed); float pulse=smoothstep(0.0,0.06,s)*smoothstep(0.45,0.08,s); float edge=1.0-abs(vUv.y-0.5)*2.0; gl_FragColor=vec4(uColor*uBoost*(0.35+pulse*1.2), (0.25+pulse*0.75)*edge); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    });
    s.updaters.push((t) => { mat.uniforms.uTime.value = t; });
    return mat;
  };
  const lanes = [], edgeBy = new Map(), links = [];
  s.linkMats = new Map();
  for (const n of nodes) {
    const a = new THREE.Vector3(n.from.x, 0, n.from.z), b = new THREE.Vector3(n.to.x, 0, n.to.z);
    const dir = b.clone().sub(a); const len = dir.length(); dir.normalize();
    const start = a.clone().addScaledVector(dir, n.from.r), end = b.clone().addScaledVector(dir, -n.to.r);
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((n.bend || 0) * len));
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    lanes.push(ribbon(curve, 3, 0.06, 56, 2.6));
    const eg = edgeBy.get(n.color) || []; eg.push(ribbon(curve, 0.13, 0.085, 56, 1, 1.42), ribbon(curve, 0.13, 0.085, 56, 1, -1.42)); edgeBy.set(n.color, eg);
    const core = new THREE.Mesh(ribbon(curve, 1.5, 0.11, 56, 1), flowMat(n.color, 0.45));
    core.renderOrder = 2; s.scene.add(core); s.noReflect.push(core);
    if (n.key) s.linkMats.set(n.key, core.material);
    links.push({ curve, color: n.color });
  }
  s.scene.add(s._shadow(new THREE.Mesh(mergeGeometries(lanes), s.mats.lane), false, true));
  for (const [color, eg] of edgeBy) s.scene.add(new THREE.Mesh(mergeGeometries(eg), s.glow(color, 2.2)));

  // packets
  const per = s.quality === 'low' ? 3 : 5, total = links.length * per;
  const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.48, 0.62), new THREE.MeshBasicMaterial({ toneMapped: false }), total);
  s.scene.add(pm);
  links.forEach((l, li) => { for (let k = 0; k < per; k++) pm.setColorAt(li * per + k, new THREE.Color(l.color).multiplyScalar(s.clay ? 1 : 2.2)); });
  const o = new THREE.Object3D();
  s.updaters.push((t) => {
    links.forEach((l, li) => {
      for (let k = 0; k < per; k++) {
        const u = (k / per + t * 0.055 + li * 0.13) % 1;
        const p = l.curve.getPointAt(u);
        o.position.set(p.x, 0.62 + Math.sin(t * 4 + k) * 0.05, p.z); o.rotation.set(0, t * 0.8 + k, 0); o.updateMatrix();
        pm.setMatrixAt(li * per + k, o.matrix);
      }
    });
    pm.instanceMatrix.needsUpdate = true;
  });
}
