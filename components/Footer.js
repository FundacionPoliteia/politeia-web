import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <div className="logo"><span className="dot"></span>Politeia</div>
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
