import { memo, useEffect, useId, useRef } from 'react';

const stars = [[8,76],[24,30],[65,12],[106,23],[149,14],[174,53],[55,43],[137,42],[180,94],[18,117],[37,155],[80,172],[125,160],[163,144],[49,140],[100,144],[151,114]];
const edges = [[0,1],[1,2],[2,3],[3,4],[4,5],[1,6],[6,2],[6,3],[3,7],[7,4],[7,5],[5,8],[0,9],[9,10],[10,11],[11,12],[12,13],[13,8],[9,14],[14,10],[14,11],[11,15],[15,12],[13,16],[16,8],[0,6],[0,14],[14,15],[15,16],[16,12],[16,5],[7,16],[1,3]];

export const HomeConstellation = memo(function HomeConstellation({ active }: { active: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const glow = useId();
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const points = element.querySelectorAll<SVGCircleElement>('.constellation-star');
    const links = element.querySelector<SVGPathElement>('.constellation-links')!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, previous = 0, time = 0;
    function draw() {
      const positions = stars.map(([x,y], i) => [x + Math.sin(time * .7 + i * 1.7) * 7, y + Math.cos(time * .55 + i * 1.3) * 6]);
      points.forEach((point, i) => {
        point.setAttribute('cx', String(positions[i][0]));
        point.setAttribute('cy', String(positions[i][1]));
        point.style.opacity = String(.45 + .55 * (Math.sin(time * 1.8 + i) + 1) / 2);
      });
      links.setAttribute('d', edges.map(([a,b]) => `M${positions[a].join(' ')}L${positions[b].join(' ')}`).join(' '));
    }
    function tick(now: number) {
      time += previous ? Math.min((now - previous) / 1000, .05) : 0;
      previous = now;
      draw();
      frame = requestAnimationFrame(tick);
    }
    function synchronize() {
      cancelAnimationFrame(frame); previous = 0;
      if (active && !reduced.matches && !document.hidden) frame = requestAnimationFrame(tick);
      else draw();
    }
    synchronize();
    reduced.addEventListener('change', synchronize);
    document.addEventListener('visibilitychange', synchronize);
    return () => { cancelAnimationFrame(frame); reduced.removeEventListener('change', synchronize); document.removeEventListener('visibilitychange', synchronize); };
  }, [active]);
  return <svg ref={svg} className="orb-constellation" viewBox="0 0 184 184" aria-hidden="true">
    <defs><radialGradient id={glow}><stop stopColor="#65d7e8" stopOpacity=".08" /><stop offset=".6" stopColor="#65d7e8" stopOpacity=".025" /><stop offset="1" stopColor="#65d7e8" stopOpacity="0" /></radialGradient></defs>
    <ellipse cx="92" cy="92" rx="108" ry="105" fill={`url(#${glow})`} />
    <path className="constellation-links" />
    {stars.map(([x,y], i) => <circle key={i} className="constellation-star" cx={x} cy={y} r={i % 4 === 0 ? 2.1 : 1.3} />)}
  </svg>;
});
