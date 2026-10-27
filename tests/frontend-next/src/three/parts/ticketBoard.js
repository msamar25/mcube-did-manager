// Replacement flow as a 3D ticket board (replaces the floating "packets" status path).
// Four standing glass boards — Incoming, In progress, Resolved, Failed — each drawn like a column of a
// ticketing system: coloured header with the live count and the newest real tickets as cards.
// One ILLUSTRATIVE ticket card glides from board to board to show the lifecycle; the boards' contents are real.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ribbon, offsetCurve } from '../geometry.js';

// Same grouping as the dashboard hub (lib/support.js), using the backend's statuses only.
export const COLUMNS = [
  { key: 'incoming', label: 'Incoming', statuses: ['pending', 'approved', 'review_required'], color: '#f5a524' },
  { key: 'progress', label: 'In progress', statuses: ['processing', 'needs_reconciliation'], color: '#3b82f6' },
  { key: 'resolved', label: 'Resolved', statuses: ['completed'], color: '#22c55e' },
  { key: 'failed', label: 'Failed', statuses: ['failed'], color: '#ef4444' }
];
const f = (v) => Number(v ?? 0).toLocaleString('en-IN');
const BW = 4.8, BH = 6; // board size (world units)
const CW = 560, CH = 700; // canvas size (px)

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function ago(t) {
  const ms = Date.now() - (Date.parse(t) || 0); if (!Number.isFinite(ms) || ms < 0 || ms > 3e11) return '';
  const m = Math.round(ms / 6e4); if (m < 60) return `${Math.max(1, m)}m`; const h = Math.round(m / 60); if (h < 48) return `${h}h`; return `${Math.round(h / 24)}d`;
}
function fit(g, text, max) { let s = String(text || ''); while (s.length > 1 && g.measureText(s).width > max) s = s.slice(0, -2) + '…'; return s; }

// Draw one column: header + up to 5 ticket cards + "+N more".
function drawBoard(ctx, col, count, tickets) {
  const g = ctx;
  g.clearRect(0, 0, CW, CH);
  rr(g, 6, 6, CW - 12, CH - 12, 34); g.fillStyle = 'rgba(255,255,255,0.94)'; g.fill();
  g.lineWidth = 3; g.strokeStyle = col.color + '55'; g.stroke();
  // header
  rr(g, 22, 22, CW - 44, 112, 24); g.fillStyle = col.color; g.fill();
  g.fillStyle = '#fff'; g.font = '700 40px Inter, system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(col.label, 50, 78);
  g.font = '800 54px Inter, system-ui, sans-serif'; g.textAlign = 'right'; g.fillText(f(count), CW - 50, 80); g.textAlign = 'left';
  // cards
  const shown = tickets.slice(0, 5);
  shown.forEach((t, i) => {
    const y = 158 + i * 98;
    rr(g, 26, y, CW - 52, 84, 18); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#e6e9ef'; g.stroke();
    rr(g, 26, y, 12, 84, 6); g.fillStyle = col.color; g.fill();
    g.fillStyle = '#141a26'; g.font = '700 28px ui-monospace, SFMono-Regular, Menlo, monospace'; g.fillText(t.ticket_no || '—', 56, y + 30);
    g.fillStyle = '#5b6474'; g.font = '500 24px Inter, system-ui, sans-serif'; g.fillText(fit(g, t.agent_name || t.agent_number || '', CW - 200), 56, y + 62);
    const a = ago(t.first_call_utc); if (a) { g.textAlign = 'right'; g.fillStyle = '#8b93a3'; g.font = '600 24px Inter, system-ui, sans-serif'; g.fillText(a, CW - 46, y + 30); g.textAlign = 'left'; }
  });
  if (!shown.length) { g.fillStyle = '#9aa3b2'; g.font = '500 28px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('No tickets', CW / 2, 330); g.textAlign = 'left'; }
  if (count > shown.length) { g.fillStyle = col.color; g.font = '700 26px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(`+${f(count - shown.length)} more`, CW / 2, CH - 40); g.textAlign = 'left'; }
}

function ticketTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 150; const g = c.getContext('2d');
  rr(g, 4, 4, 248, 142, 22); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#f26b1d'; g.stroke();
  rr(g, 4, 4, 18, 142, 9); g.fillStyle = '#f26b1d'; g.fill();
  g.fillStyle = '#141a26'; g.font = '800 34px Inter, system-ui, sans-serif'; g.fillText('TICKET', 42, 58);
  g.fillStyle = '#9aa3b2'; for (const [y, w] of [[86, 170], [112, 120]]) { rr(g, 42, y, w, 12, 6); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildTicketBoard(s, ptsIn) {
  const pts = ptsIn.map(([a, b]) => new THREE.Vector3(a, 0, b));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const m = s.mats, Y = 0.06;

  // walkway on the floor linking the boards (kept from the previous design, no moving packets)
  const walk = new THREE.MeshPhysicalMaterial({ color: '#f3f6fa', roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.85 });
  s.scene.add(s._shadow(new THREE.Mesh(ribbon(curve, 2.6, Y, 160), walk), false, true));
  const edges = [-1.35, 1.35].map((off) => new THREE.TubeGeometry(offsetCurve(curve, off, 0, 90), 160, 0.05, 6).translate(0, Y + 0.03, 0));
  s.scene.add(new THREE.Mesh(mergeGeometries(edges), s.glow('#ff8a3d', 2.4)));

  const cam = s.camera.position;
  const glass = new THREE.MeshPhysicalMaterial({ color: '#eef4fb', roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, envMapIntensity: 2, depthWrite: false });
  s.gates = []; s.boards = [];
  const T = [0.1, 0.37, 0.64, 0.92];
  COLUMNS.forEach((col, i) => {
    const p = curve.getPointAt(T[i]);
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    g.rotation.y = Math.atan2(cam.x - p.x, cam.z - p.z); // face the default camera
    // plinth + posts
    g.add(s._shadow(new THREE.Mesh(new RoundedBoxGeometry(BW + 0.4, 0.3, 1.3, 2, 0.08).translate(0, 0.15, 0), m.metal)));
    const posts = [-1, 1].map((sx) => new THREE.CylinderGeometry(0.07, 0.07, BH + 0.4, 10).translate(sx * (BW / 2 - 0.1), 0.3 + (BH + 0.4) / 2, -0.12));
    g.add(s._shadow(new THREE.Mesh(mergeGeometries(posts), m.metal)));
    // glass board with the column drawn on a canvas
    const glassMesh = new THREE.Mesh(new RoundedBoxGeometry(BW, BH, 0.08, 2, 0.06), glass); glassMesh.position.set(0, 0.55 + BH / 2, -0.12); g.add(glassMesh);
    const canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(BW - 0.12, BH - 0.12), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    face.position.set(0, 0.55 + BH / 2, -0.06); g.add(face);
    // glowing status edge along the top + floor ring that pulses when the demo ticket arrives
    const edge = new THREE.Mesh(new THREE.BoxGeometry(BW, 0.08, 0.1), s.glow(col.color, 3)); edge.position.set(0, 0.6 + BH, -0.12); g.add(edge);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(col.color).multiplyScalar(2.2), transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.65, 64), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.32; g.add(ring);
    s.scene.add(g);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(BW + 0.4, BH + 1, 1.4), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, (BH + 1) / 2, 0); hit.userData = { type: 'flow', key: col.key }; g.add(hit); s.hitTargets.push(hit);
    const div = s.labels?.add(g, [0, BH + 1.6, -0.12], `<b>${col.label}</b><span data-k="${col.key}">—</span>`, { cls: 'cc-gate', priority: 30 + i, onClick: () => s.onSelect({ type: 'flow', key: col.key }) });
    div?.style.setProperty('--c', col.color);
    const board = { col, ctx: canvas.getContext('2d'), tex, ring, ringMat, yaw: g.rotation.y, center: new THREE.Vector3(p.x, 0.55 + BH / 2, p.z), anchor: new THREE.Vector3(p.x, 0.55 + BH * 0.62, p.z), sig: '' };
    s.boards.push(board); s.gates.push({ st: { key: col.key }, div, board });
  });
  s.flowLabel = s.labels?.add(s.scene, [curve.getPointAt(0.5).x, 0.4, curve.getPointAt(0.5).z + 3.4], `<span class="cc-ico cc-orange"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2"><path d="M4 5h16v14H4zM4 9h16M9 9v10"/></svg></span><b>Replacement tickets</b>`, { cls: 'cc-flow', priority: 40, onClick: () => s.onSelect({ type: 'flow' }) });

  // redraw a board only when its data changed
  s.updateBoards = (data) => {
    const t = data?.tickets || {};
    for (const b of s.boards) {
      const list = t[b.col.key] || [], count = data?.columns?.[b.col.key] ?? list.length;
      const sig = `${count}|${list.slice(0, 5).map((x) => x.ticket_no).join(',')}`;
      if (sig === b.sig) continue; b.sig = sig;
      drawBoard(b.ctx, b.col, count, list); b.tex.needsUpdate = true;
      const n = s.gates.find((g) => g.board === b)?.div?.querySelector(`[data-k="${b.col.key}"]`); if (n) n.textContent = f(count);
    }
  };
  s.updateBoards(s.data);

  // ILLUSTRATIVE ticket: Incoming → In progress → Resolved (every 3rd loop → Failed), ~12 s per loop
  const tk = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.88), new THREE.MeshBasicMaterial({ map: ticketTexture(), transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  tk.castShadow = false; s.scene.add(tk);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ color: '#ffb27a', transparent: true, opacity: 0.25, toneMapped: false, depthWrite: false })); s.scene.add(halo);
  const LOOP = 12;
  const arc = (a, b) => { const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(a.y, b.y) + 2.2; return new THREE.QuadraticBezierCurve3(a, mid, b); };
  s.updaters.push((t) => {
    const loop = Math.floor(t / LOOP), lt = t - loop * LOOP, failed = loop % 3 === 2;
    const A = s.boards.map((b) => b.anchor.clone().add(new THREE.Vector3(0, 0, 0.9)));
    const end = failed ? 3 : 2;
    let pos, at = -1;
    if (lt < 2) { pos = A[0]; at = 0; }
    else if (lt < 4.5) pos = arc(A[0], A[1]).getPointAt(ease((lt - 2) / 2.5));
    else if (lt < 6.5) { pos = A[1]; at = 1; }
    else if (lt < 9) pos = arc(A[1], A[end]).getPointAt(ease((lt - 6.5) / 2.5));
    else { pos = A[end]; at = end; }
    const fade = lt < 0.4 ? lt / 0.4 : lt > 11.4 ? Math.max(0, (LOOP - lt) / 0.6) : 1;
    tk.position.copy(pos); tk.quaternion.copy(s.camera.quaternion); tk.scale.setScalar(0.6 + 0.4 * fade); tk.material.opacity = fade;
    halo.position.copy(pos).add(new THREE.Vector3(0, 0, -0.05)); halo.quaternion.copy(s.camera.quaternion); halo.material.opacity = 0.25 * fade;
    s.boards.forEach((b, i) => { const on = i === at; b.ringMat.opacity = on ? 0.55 + Math.sin(t * 4) * 0.25 : Math.max(0, b.ringMat.opacity - 0.03); b.ring.scale.setScalar(on ? 1 + (Math.sin(t * 4) + 1) * 0.03 : 1); });
  });
  const hit = new THREE.Mesh(ribbon(curve, 5, 1.5, 40), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  hit.userData = { type: 'flow' }; s.scene.add(hit); s.hitTargets.push(hit);
  s.flowCurve = curve;
}
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
