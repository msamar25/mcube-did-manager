// Simplified operator logo badges (drawn in code; approximations of each brand mark for identification).
// Used both as inline SVG in HTML labels and as canvas textures on 3D signs.
const SVG = {
  Vodafone: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e60000"/><path d="M22.6 9.2c-6.4.6-11.6 5.8-11.6 12.1 0 5.7 4.3 9.7 9.4 9.7 5.4 0 9.6-4.2 9.6-9.3 0-4.6-3.1-7-6.1-8.1.1-1.5 1-3.2 2.3-4.3-1.2-.2-2.4-.2-3.6-.1z" fill="#fff"/><circle cx="20.4" cy="21.5" r="3.6" fill="#e60000"/></svg>',
  Idea: '<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="#ffd400"/><text x="20" y="26.5" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="15" fill="#1a1a1a">!dea</text></svg>',
  Airtel: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e40000"/><path d="M14 22c0-6 5-10 10-9.6 3.4.3 4.8 2.7 3.6 5.2-1.6 3.4-7.4 5.6-9.4 9.8-.7 1.5.2 2.8 2 2.6" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><text x="20" y="35.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="6.4" fill="#fff">airtel</text></svg>',
  Tata: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#1c4fa3"/><text x="20" y="24.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="11.5" letter-spacing=".5" fill="#fff">TATA</text></svg>',
  Sify: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#0f8a68"/><text x="20" y="25" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="13" fill="#fff">sify</text></svg>',
  Jio: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#0f3cc9"/><text x="20" y="25.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="14" fill="#fff">Jio</text></svg>'
};

// Map an MCube operator name to its carrier badge (display only).
export function family(key = '') {
  const k = String(key).toLowerCase();
  if (k.includes('vodafone') || k.includes('idea')) return 'Vodafone';
  if (k.includes('tata')) return 'Tata';
  if (k.includes('sify')) return 'Sify';
  if (k.includes('jio')) return 'Jio';
  if (k.includes('airtel')) return 'Airtel';
  return '';
}
export function logoSvg(key, size = 28) {
  const s = SVG[family(key)] || SVG[key];
  if (!s) return `<span class="cc-logo" style="width:${size}px;height:${size}px">${(key || '?')[0]}</span>`;
  return `<span class="cc-brand" style="width:${size}px;height:${size}px">${s}</span>`;
}

// Canvas texture of the logo (for 3D signs). Returns a Promise-free texture that fills in once the SVG image loads.
export function logoTexture(THREE, key, bg = null) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, 256, 256); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const img = new Image();
  img.onload = () => { g.drawImage(img, 24, 24, 208, 208); t.needsUpdate = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent((SVG[family(key)] || SVG[key] || '').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" '));
  return t;
}
