import Image from 'next/image';

export const metadata = {
  title: 'A nuestros cimientos — Politeia',
  description:
    'Fundación Politeia agradece el legado, la compañía y la vocación de servicio de Fernando Antonio Oyuela.',
  openGraph: {
    title: 'A nuestros cimientos — Politeia',
    description:
      'Un agradecimiento al legado de transformación y vocación de servicio de Fernando Antonio Oyuela.',
    images: ['/fernando-antonio-oyuela.jpeg'],
  },
};

export default function AgradecimientosPage() {
  return (
    <main className="thanks-page">
      <section className="thanks-hero">
        <div className="wrap thanks-hero__inner">
          <div className="thanks-hero__copy">
            <span className="eyebrow">Agradecimientos</span>
            <h1>A nuestros cimientos</h1>
            <p>
              Un legado de transformación, compañía y vocación de servicio que
              sigue guiando cada paso de Politeia.
            </p>
          </div>

          <figure className="thanks-hero__figure">
            <figcaption>Fernando Antonio Oyuela</figcaption>
            <Image
              src="/fernando-antonio-oyuela.jpeg"
              alt="Fernando Antonio Oyuela junto a un lago y las montañas"
              width={853}
              height={1280}
              priority
              sizes="(max-width: 800px) 100vw, 48vw"
            />
          </figure>
        </div>
      </section>

      <section className="sec thanks-message">
        <div className="wrap thanks-message__inner">
          <span className="thanks-message__name">Su legado</span>
          <div className="thanks-message__copy">
            <p>
              Fundación Politeia y todos sus proyectos se deben a la constante
              motivación y férreo soporte de Fernando Antonio Oyuela, quien
              dejó un legado de transformación y vocación de servicio.
            </p>
            <p>
              A él le agradecemos enormemente su compañía y consejo en aquellos
              primeros pasos que dimos, y esperamos honrar su deseo de
              colaborar con una Argentina engrandecida.
            </p>
            <p>
              Hoy le toca cuidar nuestra patria desde arriba, pero su recuerdo
              nos guía en cada paso.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
