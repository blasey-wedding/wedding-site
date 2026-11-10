/**
 * A soft shower of petals drifting down the screen, flipping as they fall.
 * Colors come from the CSS tokens. Skipped for anyone with "reduce motion" on.
 */
export function petalShower(count = 90) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  // Weighted toward ivory and champagne, with a few deeper petals
  const colors = [v('--paper'), v('--paper'), v('--accent'), v('--accent'), v('--paper-deep'), v('--grape'), v('--wine')];

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '100' });
  document.body.appendChild(canvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const petals = Array.from({ length: count }, (_, i) => ({
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * innerHeight * 0.9,  // staggered so they arrive over time
    size: 6 + Math.random() * 8,
    vy: 0.9 + Math.random() * 1.4,
    sway: Math.random() * Math.PI * 2,
    swaySpeed: 0.6 + Math.random() * 0.9,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.04,
    flip: Math.random() * Math.PI * 2,
    vflip: 0.03 + Math.random() * 0.05,
    color: colors[i % colors.length],
  }));

  function drawPetal(s: number) {
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.95, -s * 0.55, s * 0.6, s * 0.85, 0, s);
    ctx.bezierCurveTo(-s * 0.6, s * 0.85, -s * 0.95, -s * 0.55, 0, -s);
    ctx.fill();
    ctx.globalAlpha *= 0.35;           // faint center crease for depth
    ctx.beginPath(); ctx.moveTo(0, -s * 0.7); ctx.lineTo(0, s * 0.75); ctx.stroke();
  }

  const start = performance.now();
  const DURATION = 7000;
  function frame(now: number) {
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const fade = Math.max(0, 1 - Math.max(0, now - start - DURATION * 0.7) / (DURATION * 0.3));
    for (const p of petals) {
      p.y += p.vy;
      p.x += Math.sin(t * p.swaySpeed + p.sway) * 0.8;
      p.rot += p.vr; p.flip += p.vflip;
      ctx.save();
      ctx.globalAlpha = fade * 0.95;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(p.flip))));   // petals tumbling in 3D
      ctx.fillStyle = p.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8;
      ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      drawPetal(p.size);
      ctx.restore();
    }
    if (now - start < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
