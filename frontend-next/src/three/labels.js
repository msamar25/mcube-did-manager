// Floating labels with screen-space decluttering.
// Labels are placed in priority order; any label that would overlap a
// higher-priority label, a HUD control, or the stage edge is faded out.
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class LabelLayer {
  constructor(host, { reserve = '' } = {}) {
    this.host = host;           // element that contains the canvas
    this.reserve = reserve;     // CSS selector of HUD elements labels must not cover
    this.items = [];
    this.frame = 0;
    this.compact = false;
  }

  add(parent, pos, html, { cls = '', priority = 50, onClick, pad = 4, anchor, clamp = false, nudge = false } = {}) {
    const div = document.createElement('div');
    div.className = 'cc-label ' + cls;
    div.innerHTML = html;
    if (onClick) {
      div.setAttribute('role', 'button'); div.tabIndex = 0;
      div.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      div.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } });
    }
    const obj = new CSS2DObject(div);
    obj.position.set(...pos);
    if (anchor) obj.center.set(...anchor);
    parent.add(obj);
    const item = { div, obj, priority, pad, clamp, nudge, hidden: false };
    this.items.push(item);
    this.items.sort((a, b) => a.priority - b.priority);
    return div;
  }

  // Run every few frames: cheap enough for ~16 labels.
  update(force = false) {
    if (!force && (this.frame++ % 6) !== 0) return;
    const stage = this.host.getBoundingClientRect();
    if (!stage.width) return;
    // HUD overlays usually sit beside the canvas wrapper, so look a few levels up
    const scope = this.host.closest('.hero, .cc-stage, section, main') || this.host.parentElement || this.host;
    const blocked = this.reserve ? [...scope.querySelectorAll(this.reserve)].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height) : [];
    const placed = [];
    const rank = (it) => (it.div.classList.contains('on') ? -1 : it.priority);
    const order = [...this.items].sort((a, b) => rank(a) - rank(b));
    for (const it of order) {
      if (!it.obj.visible || it.div.style.display === 'none') { this._set(it, true); continue; }
      let r = it.div.getBoundingClientRect();
      if (!r.width) { this._set(it, true); continue; }
      if (it.clamp) {
        // pin to the stage edge instead of disappearing
        const m = 8;
        const baseTop = r.top - (it.offY || 0), baseLeft = r.left - (it.offX || 0);
        const offY = Math.max(0, stage.top + m - baseTop);
        const offX = Math.max(stage.left + m - baseLeft, Math.min(0, stage.right - m - (baseLeft + r.width)));
        if (offY !== (it.offY || 0) || offX !== (it.offX || 0)) {
          it.offY = offY; it.offX = offX;
          it.div.style.marginTop = offY + 'px'; it.div.style.marginLeft = offX + 'px';
          r = new DOMRect(baseLeft + offX, baseTop + offY, r.width, r.height);
        }
      }
      const p = it.pad;
      const outR = (q) => q.left < stage.left + 4 || q.right > stage.right - 4 || q.top < stage.top + 4 || q.bottom > stage.bottom - 4;
      const hitR = (q) => (b) => q.left - p < b.right && q.right + p > b.left && q.top - p < b.bottom && q.bottom + p > b.top;
      const bad = (q) => outR(q) || blocked.some(hitR(q)) || placed.some(hitR(q));
      if (it.nudge && !it.clamp) {
        // try small shifts (down / up / right / left) before giving up and hiding the label
        const base = new DOMRect(r.left - (it.offX || 0), r.top - (it.offY || 0), r.width, r.height);
        let best = null;
        if (!bad(base)) best = [0, 0];
        else {
          const cands = [];
          // pull back inside the stage edge
          const ex = [Math.max(0, stage.left + 6 - base.left) + Math.min(0, stage.right - 6 - base.right), Math.max(0, stage.top + 6 - base.top) + Math.min(0, stage.bottom - 6 - base.bottom)];
          if (ex[0] || ex[1]) cands.push(ex);
          for (const b of [...blocked, ...placed]) {
            if (!hitR(base)(b)) continue;
            if (ex[0] || ex[1]) { const e = new DOMRect(base.left + ex[0], base.top + ex[1], base.width, base.height); cands.push([ex[0], b.bottom + p + 2 - e.top + ex[1]], [b.right + p + 2 - e.left + ex[0], ex[1]], [b.left - p - 2 - e.right + ex[0], ex[1]]); }
            cands.push([0, b.bottom + p + 2 - base.top], [0, b.top - p - 2 - base.bottom], [b.right + p + 2 - base.left, 0], [b.left - p - 2 - base.right, 0]);
          }
          cands.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
          for (const [dx, dy] of cands) { if (Math.hypot(dx, dy) > 150) break; const q = new DOMRect(base.left + dx, base.top + dy, base.width, base.height); if (!bad(q)) { best = [dx, dy]; break; } }
        }
        if (best) {
          if (best[0] !== (it.offX || 0) || best[1] !== (it.offY || 0)) { it.offX = best[0]; it.offY = best[1]; it.div.style.marginLeft = best[0] + 'px'; it.div.style.marginTop = best[1] + 'px'; }
          r = new DOMRect(base.left + best[0], base.top + best[1], base.width, base.height);
        }
      }
      const hide = bad(r);
      this._set(it, hide);
      if (!hide) placed.push(r);
    }
  }

  _set(it, hide) {
    if (it.hidden === hide) return;
    it.hidden = hide;
    it.div.classList.toggle('cc-hide', hide);
  }

  setCompact(on) {
    if (this.compact === on) return;
    this.compact = on;
    for (const it of this.items) it.div.classList.toggle('compact', on);
  }
}
