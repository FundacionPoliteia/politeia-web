'use client';

import { useEffect, useMemo, useRef } from 'react';

const parallaxInstances = new Set();
let frameId = 0;
let listenersActive = false;

function hashSeed(value) {
  return Array.from(String(value)).reduce(
    (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
}

function seededRandom(seed) {
  let state = seed || 1;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function updateParallax() {
  frameId = 0;
  parallaxInstances.forEach((update) => update());
}

function requestParallaxUpdate() {
  if (!frameId) {
    frameId = window.requestAnimationFrame(updateParallax);
  }
}

function activateListeners() {
  if (listenersActive) return;
  listenersActive = true;
  window.addEventListener('scroll', requestParallaxUpdate, { passive: true });
  window.addEventListener('resize', requestParallaxUpdate);
}

function deactivateListeners() {
  if (!listenersActive || parallaxInstances.size) return;
  listenersActive = false;
  window.removeEventListener('scroll', requestParallaxUpdate);
  window.removeEventListener('resize', requestParallaxUpdate);
  if (frameId) window.cancelAnimationFrame(frameId);
  frameId = 0;
}

const VARIANT_CONFIG = {
  newsletter: { count: 4, minSize: 260, sizeRange: 430, strength: 42 },
  project: { count: 3, minSize: 120, sizeRange: 190, strength: 24 },
  tool: { count: 3, minSize: 100, sizeRange: 150, strength: 19 },
};

export default function SoftParallaxBackdrop({
  seed,
  variant = 'project',
}) {
  const rootRef = useRef(null);
  const fieldRefs = useRef([]);
  const config = VARIANT_CONFIG[variant] || VARIANT_CONFIG.project;
  const fields = useMemo(() => {
    const random = seededRandom(hashSeed(`${variant}:${seed}`));

    return Array.from({ length: config.count }, (_, index) => {
      const depth = .35 + random() * .65;

      return {
        blur: Math.round(18 + (1 - depth) * 32),
        delay: (random() * -22).toFixed(2),
        depth,
        duration: (18 + random() * 18).toFixed(2),
        id: `${seed}-${index}`,
        opacity: (.08 + depth * .08).toFixed(3),
        size: Math.round(config.minSize + random() * config.sizeRange),
        x: Math.round(-8 + random() * 116),
        y: Math.round(-12 + random() * 124),
      };
    });
  }, [config, seed, variant]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    const update = () => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;
      if (rect.bottom < -viewportHeight || rect.top > viewportHeight * 2) return;

      const distance =
        viewportHeight / 2 - (rect.top + Math.max(rect.height, 1) / 2);
      fields.forEach((field, index) => {
        const node = fieldRefs.current[index];
        if (!node) return;
        const shift = Math.max(
          -config.strength,
          Math.min(
            config.strength,
            (distance / viewportHeight) * config.strength * field.depth,
          ),
        );
        node.style.setProperty('--field-parallax-y', `${shift.toFixed(2)}px`);
      });
    };

    parallaxInstances.add(update);
    activateListeners();
    update();

    return () => {
      parallaxInstances.delete(update);
      deactivateListeners();
    };
  }, [config.strength, fields]);

  return (
    <span
      aria-hidden="true"
      className={`soft-parallax soft-parallax--${variant}`}
      ref={rootRef}
    >
      {fields.map((field, index) => (
        <span
          className="soft-parallax__field"
          key={field.id}
          ref={(node) => {
            fieldRefs.current[index] = node;
          }}
          style={{
            '--field-blur': `${field.blur}px`,
            '--field-delay': `${field.delay}s`,
            '--field-depth': field.depth,
            '--field-duration': `${field.duration}s`,
            '--field-opacity': field.opacity,
            '--field-size': `${field.size}px`,
            '--field-x': `${field.x}%`,
            '--field-y': `${field.y}%`,
          }}
        />
      ))}
    </span>
  );
}
