<script>
  // Static illustration for phones, reduced motion or no WebGL: the admissions journey around UNext L1 support.
  const stops = [[90, 250, 'Student enquiry'], [190, 120, 'Counsellor guidance'], [330, 95, 'Application & documents'], [455, 190, 'Payment & enrollment']];
</script>
<svg viewBox="0 0 560 380" role="img" aria-label="Illustration: student enquiry, counsellor guidance, application and payment stages connected to the UNext L1 Support Hub">
  <defs><linearGradient id="lf-u" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#e8231a" /><stop offset="1" stop-color="#ff9e0b" /></linearGradient></defs>
  <rect x="20" y="40" width="520" height="310" rx="40" fill="#ffffff" stroke="#f5c7a8" stroke-width="2" />
  <path d="M40 300 C 70 260, 90 250, 110 240 S 180 130, 200 125 S 320 95, 340 100 S 445 175, 462 192" fill="none" stroke="#bcd5f7" stroke-width="12" stroke-linecap="round" />
  <path d="M40 300 C 70 260, 90 250, 110 240 S 180 130, 200 125 S 320 95, 340 100" fill="none" stroke="#ff8a3d" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 10" />
  {#each stops as [x, y], i}<path d="M{x} {y} Q {(x + 280) / 2} {Math.min(y, 250) - 70} 280 255" fill="none" stroke="#5aa2ff" stroke-width="1.5" opacity=".45" />{/each}
  {#each stops as [x, y, t], i}
    <g transform="translate({x},{y})">
      <rect x="-34" y="-20" width="68" height="34" rx="9" fill="#f7f5f2" stroke="#e3e6eb" />
      <rect x="-22" y="-12" width="44" height="14" rx="3" fill={i === 2 ? '#f5a524' : '#dbe7f5'} />
      <text y="32" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#3b4456">{i + 1} · {t}</text>
    </g>
  {/each}
  <circle cx="330" cy="62" r="8" fill="#f5a524" /><circle cx="330" cy="62" r="14" fill="none" stroke="#f5a524" opacity=".5" />
  <g transform="translate(280,265)">
    <ellipse rx="78" ry="38" fill="#ffffff" stroke="#ff8a3d" stroke-width="3" />
    <path d="M-14 -16 v14 a14 14 0 0 0 28 0 v-14 h-8 v14 a6 6 0 0 1 -12 0 v-14z" fill="url(#lf-u)" />
    <text y="26" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" font-weight="800" fill="#141a26">UNext L1 Support Hub</text>
  </g>
</svg>
<style>svg { width: 100%; height: 100%; display: block; }</style>
