'use client';

import { useEffect, useState } from 'react';

const RING_COUNT = 12;

export default function ProceduralNewsletterBackdrop() {
  const [rings, setRings] = useState([]);

  useEffect(() => {
    setRings(Array.from({ length: RING_COUNT }, (_, index) => ({
      id: `${index}-${Math.random().toString(36).slice(2)}`,
      x: randomBetween(-4, 104),
      y: randomBetween(-12, 112),
      size: randomBetween(80, 360),
      dx: randomBetween(-70, 70),
      dy: randomBetween(-42, 42),
      duration: randomBetween(18, 42),
      delay: randomBetween(-36, 0),
      opacity: randomBetween(5, 14) / 100,
    })));
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
            '--ring-duration': `${ring.duration}s`,
            '--ring-delay': `${ring.delay}s`,
            '--ring-opacity': ring.opacity,
          }}
        />
      ))}
    </div>
  );
}

function randomBetween(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}
