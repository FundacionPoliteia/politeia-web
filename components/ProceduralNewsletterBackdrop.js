'use client';

import { useEffect, useState } from 'react';

const RING_COUNT = 5;

export default function ProceduralNewsletterBackdrop() {
  const [rings, setRings] = useState([]);

  useEffect(() => {
    setRings(Array.from({ length: RING_COUNT }, (_, index) => {
      const depth = index / (RING_COUNT - 1);

      return {
        blur: randomBetween(1, 9) * (1 - depth),
        delay: randomBetween(-70, 0),
        depth,
        duration: randomBetween(42, 78),
        dx: randomBetween(-54, 54) * (.55 + depth * .45),
        dy: randomBetween(-28, 28) * (.55 + depth * .45),
        id: `${index}-${Math.random().toString(36).slice(2)}`,
        opacity: randomBetween(2.2, 6.5) / 100,
        size: randomBetween(310, 760) - depth * 120,
        stroke: randomBetween(.7, 1.4),
        x: randomBetween(-12, 112),
        y: randomBetween(-28, 128),
      };
    }));
  }, []);

  return (
    <div aria-hidden="true" className="news-procedural-backdrop">
      {rings.map((ring) => (
        <span
          className="news-procedural-ring"
          key={ring.id}
          style={{
            '--ring-x': `${ring.x}%`,
            '--ring-y': `${ring.y}%`,
            '--ring-size': `${ring.size}px`,
            '--ring-dx': `${ring.dx}px`,
            '--ring-dy': `${ring.dy}px`,
            '--ring-dx-from': `${ring.dx * -.28}px`,
            '--ring-dy-from': `${ring.dy * -.28}px`,
            '--ring-duration': `${ring.duration}s`,
            '--ring-delay': `${ring.delay}s`,
            '--ring-blur': `${ring.blur}px`,
            '--ring-opacity': ring.opacity,
            '--ring-opacity-from': ring.opacity * .62,
            '--ring-scale-from': .92 + ring.depth * .025,
            '--ring-scale-to': 1.01 + ring.depth * .035,
            '--ring-stroke': `${ring.stroke}px`,
            '--ring-z-from': `${(ring.depth - 1) * 180}px`,
            '--ring-z-to': `${(ring.depth - 1) * 120}px`,
          }}
        />
      ))}
    </div>
  );
}

function randomBetween(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}
