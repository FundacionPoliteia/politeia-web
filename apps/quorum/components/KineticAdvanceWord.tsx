'use client';

import { useEffect, useRef } from 'react';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  radius: number;
  depth: number;
  phase: number;
  accent: boolean;
};

const PARTICLE_COUNT = 76;

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function readColor(element: HTMLElement, token: string, fallback: string) {
  return getComputedStyle(element).getPropertyValue(token).trim() || fallback;
}

export default function KineticAdvanceWord() {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const hero = root.closest<HTMLElement>('.hero') ?? root;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const particles: Particle[] = [];
    const pointer = { x: 0, y: 0, active: false };
    let width = 0;
    let height = 0;
    let dpr = 1;
    let animationFrame = 0;
    let visible = true;
    let scrollPhase = window.scrollY * 0.012;
    let scrollImpulse = 0;
    let previousScrollY = window.scrollY;
    let blue = '#137a9f';
    let pink = '#fce3da';

    const createParticles = () => {
      particles.length = 0;
      const random = seededRandom(721_2026);
      for (let index = 0; index < PARTICLE_COUNT; index += 1) {
        const angle = random() * Math.PI * 2;
        const horizontalRadius = width * (0.22 + random() * 0.31);
        const verticalRadius = height * (0.12 + random() * 0.34);
        const homeX = width / 2 + Math.cos(angle) * horizontalRadius + (random() - 0.5) * width * 0.09;
        const homeY = height / 2 + Math.sin(angle) * verticalRadius + (random() - 0.5) * height * 0.09;
        particles.push({
          x: homeX,
          y: homeY,
          vx: 0,
          vy: 0,
          homeX,
          homeY,
          radius: 0.7 + random() * 1.45,
          depth: 0.35 + random() * 0.9,
          phase: random() * Math.PI * 2,
          accent: index % 9 === 0,
        });
      }
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      blue = readColor(root, '--azul', '#137a9f');
      pink = readColor(root, '--rosa', '#fce3da');
      createParticles();
    };

    const drawStatic = () => {
      context.clearRect(0, 0, width, height);
      for (const particle of particles) {
        context.globalAlpha = particle.accent ? 0.62 : 0.28;
        context.fillStyle = particle.accent ? pink : blue;
        context.beginPath();
        context.arc(particle.homeX, particle.homeY, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    const animate = (time: number) => {
      animationFrame = window.requestAnimationFrame(animate);
      if (!visible) return;

      if (reduceMotion.matches) {
        drawStatic();
        return;
      }

      const isPointerDriven = finePointer.matches && window.innerWidth > 700;
      const pointerX = pointer.active ? pointer.x : width / 2;
      const pointerY = pointer.active ? pointer.y : height / 2;
      const normalizedX = pointer.active ? Math.max(-1, Math.min(1, (pointerX / width - 0.5) * 2)) : 0;
      const normalizedY = pointer.active ? Math.max(-1, Math.min(1, (pointerY / height - 0.5) * 2)) : 0;
      const mobileWave = Math.max(-1, Math.min(1, scrollImpulse / 34));

      context.clearRect(0, 0, width, height);
      const now = time * 0.00055;

      for (const particle of particles) {
        let targetX = particle.homeX;
        let targetY = particle.homeY;

        if (isPointerDriven) {
          targetX += normalizedX * 7 * particle.depth;
          targetY += normalizedY * 4 * particle.depth;
          const deltaX = particle.x - pointerX;
          const deltaY = particle.y - pointerY;
          const distance = Math.max(1, Math.hypot(deltaX, deltaY));
          const influence = Math.max(0, 1 - distance / Math.max(72, width * 0.2));
          targetX += (deltaX / distance) * influence * 16 * particle.depth;
          targetY += (deltaY / distance) * influence * 12 * particle.depth;
        } else {
          targetX += Math.sin(scrollPhase + particle.phase) * (3.5 + particle.depth * 3);
          targetY += Math.cos(scrollPhase * 0.78 + particle.phase) * (2 + particle.depth * 3) + mobileWave * particle.depth * 8;
        }

        targetX += Math.sin(now + particle.phase) * 1.4 * particle.depth;
        targetY += Math.cos(now * 0.82 + particle.phase) * 1.1 * particle.depth;
        particle.vx = (particle.vx + (targetX - particle.x) * 0.035) * 0.88;
        particle.vy = (particle.vy + (targetY - particle.y) * 0.035) * 0.88;
        particle.x += particle.vx;
        particle.y += particle.vy;
      }

      for (let first = 0; first < particles.length; first += 1) {
        for (let second = first + 1; second < particles.length; second += 1) {
          const a = particles[first];
          const b = particles[second];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance < 48) {
            context.globalAlpha = (1 - distance / 48) * 0.075;
            context.strokeStyle = blue;
            context.lineWidth = 0.7;
            context.beginPath();
            context.moveTo(a.x, a.y);
            context.lineTo(b.x, b.y);
            context.stroke();
          }
        }
      }

      for (const particle of particles) {
        context.globalAlpha = particle.accent ? 0.74 : 0.38 + particle.depth * 0.14;
        context.fillStyle = particle.accent ? pink : blue;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      scrollImpulse *= 0.9;
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      pointer.active = true;
    };
    const onPointerLeave = () => { pointer.active = false; };
    const onScroll = () => {
      const currentScrollY = window.scrollY;
      scrollImpulse = Math.max(-48, Math.min(48, currentScrollY - previousScrollY));
      scrollPhase = currentScrollY * 0.012;
      previousScrollY = currentScrollY;
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { rootMargin: '120px' });
    resizeObserver.observe(canvas);
    intersectionObserver.observe(root);
    hero.addEventListener('pointermove', onPointerMove);
    hero.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    resize();
    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      hero.removeEventListener('pointermove', onPointerMove);
      hero.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <em ref={rootRef} className="kinetic-advance">
      <canvas ref={canvasRef} className="kinetic-advance-canvas" aria-hidden="true" />
      <span className="kinetic-advance-text">avanza.</span>
    </em>
  );
}
