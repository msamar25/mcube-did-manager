// Procedural canvas textures (no external image assets needed).
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 8 x 8 window grid. Returns { map, emissive } sharing the same layout.
export function facadeTextures(kind = 'office', seed = 7, lit = true) {
  const S = 512, N = 8, cell = S / N;
  const [c, g] = canvas(S, S);
  const [e, ge] = canvas(S, S);
  const r = rng(seed);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  if (kind === 'glass') {
    const grad = g.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, '#9fb9d6'); grad.addColorStop(0.5, '#6f8fb5'); grad.addColorStop(1, '#a9c2dc');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const shade = 0.85 + r() * 0.3;
      g.fillStyle = `rgba(${40 * shade},${70 * shade},${110 * shade},0.35)`;
      g.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 6);
      if (lit && r() < 0.32) { ge.fillStyle = `rgba(255,${190 + r() * 50},${120 + r() * 60},${0.55 + r() * 0.45})`; ge.fillRect(x * cell + 4, y * cell + 6, cell - 8, cell - 12); }
    }
    g.strokeStyle = 'rgba(235,242,250,0.9)'; g.lineWidth = 3;
    for (let i = 0; i <= N; i++) { g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.stroke(); }
    g.lineWidth = 5;
    for (let i = 0; i <= N; i++) { g.beginPath(); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke(); }
  } else {
    g.fillStyle = kind === 'clay' ? '#f4f6f9' : '#e9ebef'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const px = x * cell + 9, py = y * cell + 12, w = cell - 18, h = cell - 22;
      const glass = g.createLinearGradient(px, py, px + w, py + h);
      if (kind === 'clay') { glass.addColorStop(0, '#c9d6e6'); glass.addColorStop(1, '#aebfd6'); }
      else { glass.addColorStop(0, '#3d4f6d'); glass.addColorStop(0.55, '#26354f'); glass.addColorStop(1, '#4b6286'); }
      g.fillStyle = glass; g.fillRect(px, py, w, h);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(px, py, w * 0.35, h);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(px, py + h, w, 3);
      if (lit && r() < 0.38) {
        ge.fillStyle = `rgba(255,${185 + r() * 60},${110 + r() * 70},${0.6 + r() * 0.4})`;
        ge.fillRect(px + 1, py + 1, w - 2, h - 2);
      }
    }
  }
  // keep a clean wall patch at the very corner for roof UVs
  g.fillStyle = kind === 'glass' ? '#c4cfdc' : kind === 'clay' ? '#f4f6f9' : '#d9dce2';
  g.fillRect(0, 0, 6, 6);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 6, 6);
  return { map: tex(c), emissive: tex(e) };
}

export function floorTexture(clay = false) {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S / 2);
  if (clay) { grad.addColorStop(0, '#eef3fa'); grad.addColorStop(1, '#d9e3f1'); }
  else { grad.addColorStop(0, '#e9ecf0'); grad.addColorStop(1, '#cfd4dc'); }
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  g.strokeStyle = clay ? 'rgba(120,140,170,0.08)' : 'rgba(90,100,120,0.08)'; g.lineWidth = 1;
  for (let i = 0; i <= S; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
  }
  const t = tex(c, { repeat: false });
  return t;
}

export function rackTextures() {
  const [c, g] = canvas(128, 256);
  const [e, ge] = canvas(128, 256);
  g.fillStyle = '#1b2333'; g.fillRect(0, 0, 128, 256);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 128, 256);
  const r = rng(11);
  for (let y = 8; y < 248; y += 14) {
    g.fillStyle = '#263247'; g.fillRect(8, y, 112, 10);
    for (let x = 14; x < 110; x += 10) {
      if (r() < 0.55) { const col = r() < 0.8 ? '#4fb3ff' : '#7dffb1'; g.fillStyle = col; ge.fillStyle = col; g.fillRect(x, y + 3, 4, 3); ge.fillRect(x, y + 3, 4, 3); }
    }
    ge.fillStyle = 'rgba(60,140,255,0.6)'; ge.fillRect(8, y + 9, 112, 1);
  }
  return { map: tex(c), emissive: tex(e) };
}

export function didCardTexture(lines, seed = 1) {
  const [c, g] = canvas(256, 160);
  const r = rng(seed);
  const grad = g.createLinearGradient(0, 0, 256, 160);
  grad.addColorStop(0, 'rgba(40,120,255,0.95)'); grad.addColorStop(1, 'rgba(20,80,210,0.85)');
  g.fillStyle = grad; roundRect(g, 4, 4, 248, 152, 14); g.fill();
  g.strokeStyle = 'rgba(180,220,255,0.9)'; g.lineWidth = 3; roundRect(g, 4, 4, 248, 152, 14); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.font = '700 20px Inter, sans-serif'; g.fillText('DID POOL', 18, 34);
  g.font = '500 17px ui-monospace, monospace';
  lines.forEach((l, i) => { g.fillStyle = `rgba(220,236,255,${0.75 + r() * 0.25})`; g.fillText(l, 18, 66 + i * 26); });
  return tex(c, { repeat: false });
}

export function phoneGlyphTexture() {
  const [c, g] = canvas(256, 256);
  g.translate(128, 128); g.scale(5.4, 5.4); g.translate(-12, -12);
  const p = new Path2D('M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z');
  g.fillStyle = '#ffffff'; g.fill(p);
  return tex(c, { repeat: false });
}

export function glowTexture(color = '#ff8a3d') {
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, color); grad.addColorStop(0.25, color + 'aa'); grad.addColorStop(1, color + '00');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  return tex(c, { repeat: false });
}

export function screenTexture(hue = '#3fd0ff') {
  const [c, g] = canvas(64, 40);
  g.fillStyle = '#0d1a2b'; g.fillRect(0, 0, 64, 40);
  g.fillStyle = hue; g.globalAlpha = 0.9;
  for (let y = 6; y < 36; y += 6) g.fillRect(6, y, 20 + ((y * 7) % 30), 2);
  g.globalAlpha = 1;
  return tex(c, { repeat: false });
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Stone band with the UNext "U" monogram, wrapped around the hub rotunda (inspired by the HQ tower).
export function brandBandTexture() {
  const [c, g] = canvas(1024, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#efe4d3'); grad.addColorStop(1, '#ddd0bb');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = 'rgba(120,100,80,0.12)';
  for (let x = 0; x < 1024; x += 64) g.fillRect(x, 0, 2, 128);
  for (const cx of [256, 768]) {
    g.fillStyle = '#fbf7f1'; roundRect(g, cx - 150, 18, 300, 92, 10); g.fill();
    // U monogram
    g.fillStyle = '#e8432d';
    g.beginPath(); g.moveTo(cx - 128, 34); g.lineTo(cx - 128, 70); g.quadraticCurveTo(cx - 128, 98, cx - 98, 98); g.lineTo(cx - 82, 98);
    g.quadraticCurveTo(cx - 52, 98, cx - 52, 70); g.lineTo(cx - 52, 34); g.lineTo(cx - 68, 34); g.lineTo(cx - 68, 70);
    g.quadraticCurveTo(cx - 68, 82, cx - 82, 82); g.lineTo(cx - 98, 82); g.quadraticCurveTo(cx - 112, 82, cx - 112, 70); g.lineTo(cx - 112, 34); g.closePath(); g.fill();
    g.fillStyle = '#fbf7f1'; g.fillRect(cx - 95, 34, 10, 34);
    g.fillStyle = '#3a3f4a'; g.font = '700 58px Inter, sans-serif'; g.textBaseline = 'middle'; g.fillText('next', cx - 40, 66);
  }
  return tex(c);
}

// ---------- v2 textures ----------
// Vertical light slits for platform side walls (emissive) on a dark metal base.
export function rimSlitTextures(color = '#ff8a3d', count = 48) {
  const [c, g] = canvas(1024, 64);
  const [e, ge] = canvas(1024, 64);
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#59606c'); grad.addColorStop(0.5, '#353b46'); grad.addColorStop(1, '#262b33');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 64);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 1024, 64);
  const step = 1024 / count;
  for (let i = 0; i < count; i++) {
    const x = i * step + step * 0.35;
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(i * step, 0, 2, 64);
    ge.fillStyle = color; ge.globalAlpha = 0.95; ge.fillRect(x, 18, step * 0.3, 28); ge.globalAlpha = 1;
  }
  ge.fillStyle = color; ge.fillRect(0, 58, 1024, 3);
  const t1 = tex(c), t2 = tex(e);
  t1.wrapT = t2.wrapT = THREE.ClampToEdgeWrapping;
  return { map: t1, emissive: t2 };
}

// Soft radial shadow used as cheap ambient occlusion under platforms and towers.
export function contactShadowTexture() {
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 30, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.25)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  return tex(c, { repeat: false, srgb: false });
}

// Illuminated name sign for an operator tower (name text, not a brand logo).
export function signTexture(name, color) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#10141c'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = color; g.fillRect(0, 0, 14, 128);
  g.font = '800 64px Inter, sans-serif'; g.textBaseline = 'middle';
  g.fillStyle = '#ffffff'; g.fillText(name.toUpperCase(), 40, 68);
  return tex(c, { repeat: false });
}

// Deck surface with concentric engraved rings.
export function deckTexture(clay = false) {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = clay ? '#f6f8fb' : '#e8eaee'; g.fillRect(0, 0, S, S);
  g.strokeStyle = clay ? 'rgba(120,140,170,0.12)' : 'rgba(60,70,85,0.13)';
  for (let r = 30; r < S / 2; r += 26) { g.lineWidth = r % 78 === 4 ? 3 : 1.2; g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.stroke(); }
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * 60, S / 2 + Math.sin(a) * 60); g.lineTo(S / 2 + Math.cos(a) * S / 2, S / 2 + Math.sin(a) * S / 2); g.lineWidth = 1; g.stroke(); }
  return tex(c, { repeat: false });
}

// Lane surface: dark glossy strip with chevrons along u.
export function laneTexture() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#2f3540'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = 'rgba(255,255,255,0.07)';
  for (let x = 0; x < 256; x += 64) { g.beginPath(); g.moveTo(x + 10, 14); g.lineTo(x + 34, 32); g.lineTo(x + 10, 50); g.lineTo(x + 20, 50); g.lineTo(x + 44, 32); g.lineTo(x + 20, 14); g.fill(); }
  return tex(c);
}

// Vertical gradient for light beams (alpha only).
export function beamTexture() {
  const [c, g] = canvas(8, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.35)'); grad.addColorStop(1, 'rgba(255,255,255,0.9)');
  g.fillStyle = grad; g.fillRect(0, 0, 8, 256);
  return tex(c, { repeat: false, srgb: false });
}

// ---------- office interior textures ----------
export function officeFloorTexture(clay = false) {
  const S = 1024; const [c, g] = canvas(S, S);
  g.fillStyle = clay ? '#f5f7fa' : '#e9ebee'; g.fillRect(0, 0, S, S);
  g.strokeStyle = clay ? 'rgba(120,140,170,0.08)' : 'rgba(70,80,95,0.10)'; g.lineWidth = 1.5;
  for (let i = 0; i <= S; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  return tex(c);
}
export function carpetTexture(clay = false) {
  const S = 256; const [c, g] = canvas(S, S); const r = rng(5);
  g.fillStyle = clay ? '#e6ebf2' : '#5c6370'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) { g.fillStyle = clay ? `rgba(255,255,255,${r() * 0.25})` : `rgba(${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},${r() * 0.06})`; g.fillRect(r() * S, r() * S, 2, 2); }
  return tex(c);
}
export function wallSignTexture(lines, color = '#f26b1d', dark = false) {
  const [c, g] = canvas(512, 160);
  g.fillStyle = dark ? '#141a26' : '#ffffff'; g.fillRect(0, 0, 512, 160);
  g.fillStyle = color; g.fillRect(0, 0, 10, 160);
  g.textBaseline = 'middle'; g.fillStyle = dark ? '#ffffff' : '#141a26';
  g.font = '800 54px Inter, sans-serif'; g.fillText(lines[0], 34, lines[1] ? 58 : 82);
  if (lines[1]) { g.font = '500 30px Inter, sans-serif'; g.fillStyle = dark ? 'rgba(255,255,255,.7)' : '#6b7486'; g.fillText(lines[1], 36, 112); }
  return tex(c, { repeat: false });
}
