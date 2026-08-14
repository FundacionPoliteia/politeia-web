import Link from 'next/link';

const SHOW_PUBLIC_FOOTER = process.env.NEXT_PUBLIC_SITE_LAUNCHED === 'true';

export default function Footer() {
  if (!SHOW_PUBLIC_FOOTER) return null;

  return (
    <footer className="footer">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <Link aria-label="Ir al inicio de Politeia" className="logo" href="/">
              <span className="dot"></span>
              Politeia
            </Link>
            <p>Jóvenes que buscamos fortalecer el nexo que une al ciudadano con la política, de forma innovadora y profesional.</p>
          </div>
          <div className="foot-col">
            <h5>Entorno</h5>
            <a href="https://politeiatest.vercel.app/" target="_blank" rel="noopener">Promesas</a>
            <span style={{display:'block',color:'var(--gris)',fontSize:'.92rem',marginBottom:'10px',opacity:.6}}>Quorum (próximamente)</span>
            <Link href="/blog">Blog</Link>
          </div>
          <div className="foot-col">
            <h5>Fundación</h5>
            <Link href="/origen">Origen</Link>
            <Link href="/equipo">Equipo</Link>
            <Link href="/proyectos">Proyectos</Link>
            <Link href="/agradecimientos">Legado</Link>
            <Link className="footer-sumate" href="/sumate">
              <span aria-hidden="true" className="footer-sumate-dot" />
              <span>Sumate</span>
              <span aria-hidden="true" className="material-symbols-outlined">arrow_forward</span>
            </Link>
          </div>
          <div className="foot-col">
            <h5>Seguinos</h5>
            <a href="https://www.instagram.com/fundacion.politeia/" target="_blank" rel="noopener">Instagram</a>
            <a href="https://twitter.com/politeiaarg" target="_blank" rel="noopener">X / Twitter</a>
            <a href="https://www.youtube.com/@politeia4626" target="_blank" rel="noopener">YouTube</a>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} Fundación Politeia. Hecho en Argentina.</span>
          <span>politeia.ar</span>
        </div>
      </div>
    </footer>
  );
}
