(() => {
  const canvas = document.querySelector('.hood-ascii');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const image = new Image();
  const points = [];
  let width = 0, height = 0, frame = 0, last = 0, phase = 0, visible = true;
  const glyphs = '.:+=*#';
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    if (!points.length) return;
    const angle = reduced.matches ? -.22 : phase;
    const c = Math.cos(angle), s = Math.sin(angle);
    const size = Math.min(width * .84, 690);
    const projected = points.map(p => {
      const x = p.x * c + p.z * s, z = -p.x * s + p.z * c;
      const perspective = 2.7 / (2.7 - z);
      return {x:width / 2 + x * size * perspective, y:Math.min(height / 2,390) + (p.y + Math.sin(angle * 1.7) * .022) * size * perspective, z, i:p.i};
    }).sort((a,b) => a.z - b.z);
    ctx.font = `${width < 600 ? 8 : 10}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of projected) {
      const light = Math.max(0, Math.min(1, (p.z + .55) / 1.1));
      ctx.fillStyle = `rgba(255,${Math.round(65+light*35)},${Math.round(77+light*35)},${.1+light*.25})`;
      ctx.fillText(glyphs[(p.i + Math.floor(light*3)) % glyphs.length],p.x,p.y);
    }
  }
  function tick(now) {
    frame = 0;
    if (!visible || document.hidden || reduced.matches) { last = 0; return; }
    if (!last || now-last >= 33) {
      phase += last ? Math.min(now-last,70) * .00025 : 0;
      last = now; draw();
    }
    frame = requestAnimationFrame(tick);
  }
  function schedule() {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    if (reduced.matches) draw();
    else if (visible && !document.hidden && points.length) frame = requestAnimationFrame(tick);
  }
  image.onload = () => {
    const sample = document.createElement('canvas'); sample.width = sample.height = 90;
    const sc = sample.getContext('2d', {willReadFrequently:true});
    sc.drawImage(image,0,0,90,90);
    const pixels = sc.getImageData(0,0,90,90).data;
    let id = 0;
    for(let y=0;y<90;y++) for(let x=0;x<90;x++) {
      const i=(y*90+x)*4;
      if(pixels[i+3]>120 && pixels[i]>100 && pixels[i]>pixels[i+1]*1.4) {
        for(const z of [-.065,.065]) points.push({x:(x-45)/65,y:(y-45)/65,z,i:id++});
      }
    }
    resize(); schedule();
  };
  new ResizeObserver(resize).observe(canvas.parentElement);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();}).observe(canvas);
  reduced.addEventListener('change',schedule);
  document.addEventListener('visibilitychange',schedule);
  image.src='/assets/hushmark-hood-red.png';
})();
