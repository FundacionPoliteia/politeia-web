'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const ENDINGS = ['tuya', 'de Fran', 'de Rosa', 'de Juana', 'de todos', 'tuya también', 'de vos'];
const PREFIX = 'es ';

export default function Hero({ destacadas = [] }) {
  const [texto, setTexto] = useState('');
  const idx = useRef(0);
  const pos = useRef(0);
  const borrando = useRef(false);

  // efecto máquina de escribir
  useEffect(() => {
    let timer;
    function tick() {
      const full = PREFIX + ENDINGS[idx.current];
      if (!borrando.current) {
        pos.current++;
        setTexto(full.slice(0, pos.current));
        if (pos.current >= full.length) {
          borrando.current = true;
          timer = setTimeout(tick, 1600);
          return;
        }
        timer = setTimeout(tick, 75);
      } else {
        pos.current--;
        setTexto(full.slice(0, Math.max(pos.current, PREFIX.length)));
        if (pos.current <= PREFIX.length) {
          borrando.current = false;
          idx.current = (idx.current + 1) % ENDINGS.length;
          timer = setTimeout(tick, 300);
          return;
        }
        timer = setTimeout(tick, 45);
      }
    }
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, []);

  // carrusel
  const [slide, setSlide] = useState(0);
  const slides = destacadas.slice(0, 4);
  useEffect(() => {
    if (!slides.length) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % slides.length), 4500);
    return () => clearInterval(t);
  }, [slides.length]);

  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div>
          <span className="eyebrow">Acercar la ciudadanía a la política</span>
          <h1>
            La política <em>también</em>
            <br />
            <span className="tw">
              <span>{texto}</span>
              <span className="caret"></span>
            </span>
          </h1>
          <p>Politeia abre los datos, las leyes y las elecciones para participar con información accesible al ciudadano.</p>
          <div className="btn-row">
            <Link href="/proyectos" className="btn btn-primary">Explorá Politeia →</Link>
            <Link href="/blog" className="btn btn-ghost">Leer el Blog</Link>
          </div>
        </div>
        <div className="hero-art">
          <span className="carousel-label">Lo último</span>
          <div className="carousel">
            {slides.length === 0 && (
              <div className="slide active">
                <h3 style={{ color: 'var(--hueso)' }}>Bienvenidos a Politeia</h3>
              </div>
            )}
            {slides.map((p, i) => (
              <Link
                key={p.id}
                href={`/blog/${p.slug}`}
                className={`slide ${i === slide ? 'active' : ''}`}
              >
                <span className="slide-cat">{p.categoria || 'Nota'}</span>
                <h3>{p.titulo}</h3>
                <span className="slide-go">Leer →</span>
              </Link>
            ))}
          </div>
          <div className="dots">
            {slides.map((_, i) => (
              <button
                key={i}
                className={i === slide ? 'on' : ''}
                onClick={() => setSlide(i)}
                aria-label={`Ir a slide ${i + 1}`}
              ></button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
