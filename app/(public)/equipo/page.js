export const metadata = { title: 'Equipo — Politeia' };

// NOTA: nombres tomados de autores reales del Observatorio como provisorio.
// Reemplazá roles y sumá fotos cuando lleguen las fichas de Desarrollo Institucional.
// Para agregar una foto, poné la URL en "foto": 'https://...'
const MIEMBROS = [
  { nombre: 'Marco Curcio', rol: 'Políticas Públicas', foto: null },
  { nombre: 'Trinidad Reynoso Castillo', rol: 'Ambiente', foto: null },
  { nombre: 'Victoria Rinaldi', rol: 'DD.HH. y Género', foto: null },
  { nombre: 'Leonardo Blanco Bruni', rol: 'Desarrollo Social', foto: null },
  { nombre: 'Pablo Curiel', rol: 'Relaciones Internacionales', foto: null },
  { nombre: 'Juana de Urquiza', rol: 'Programa PoliteZ', foto: null },
  { nombre: 'Marco L. Sánchez Bértoli', rol: 'Informe Especial', foto: null },
  { nombre: 'Facundo López', rol: 'Economía', foto: null },
];

export default function EquipoPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">Quiénes somos</span>
          <h1>Un equipo que cruza política, datos y diseño.</h1>
          <p className="lead">Jóvenes de distintas disciplinas que comparten una misma idea: la política se entiende mejor cuando se la mira de cerca.</p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="team">
            {MIEMBROS.map((m) => (
              <div key={m.nombre} className="member">
                <div
                  className="ph"
                  style={m.foto ? { backgroundImage: `url('${m.foto}')` } : {}}
                ></div>
                <h4>{m.nombre}</h4>
                <span>{m.rol}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
