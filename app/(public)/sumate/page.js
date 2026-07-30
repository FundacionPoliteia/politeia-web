import TeamApplicationForm from '../../../components/TeamApplicationForm';

export const metadata = {
  title: 'Sumate a Politeia',
  description: 'Postulate para participar de los equipos y proyectos de Fundacion Politeia.',
};

export default function JoinPage() {
  return (
    <main className="join-page">
      <header className="join-hero">
        <div className="wrap">
          <span className="eyebrow">Sumate</span>
          <h1>Construyamos juntos una politica mas cercana.</h1>
          <p>Buscamos personas con vocacion de servicio, curiosidad y ganas de transformar ideas en proyectos concretos.</p>
        </div>
      </header>
      <section className="join-form-section">
        <div className="wrap join-form-layout">
          <div>
            <span className="eyebrow">Postulacion</span>
            <h2>Contanos sobre vos.</h2>
            <p>La informacion se revisa de forma privada y segura.</p>
          </div>
          <TeamApplicationForm />
        </div>
      </section>
    </main>
  );
}
