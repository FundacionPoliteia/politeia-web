'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './LegislativePath.module.css';

const OFFICIAL_SOURCES = {
  bulletin: 'https://www.boletinoficial.gob.ar/',
  bulletinFirst: 'https://www.boletinoficial.gob.ar/seccion/primera',
  bulletinSecond: 'https://www.boletinoficial.gob.ar/seccion/segunda',
  bulletinThird: 'https://www.boletinoficial.gob.ar/seccion/tercera',
  bulletinFourth: 'https://www.boletinoficial.gob.ar/seccion/cuarta',
  chambers: 'https://www4.hcdn.gob.ar/dependencias/dip/congreso/diagrama_del_mecanismo_de_sancio.htm',
  congress: 'https://www.hcdn.gob.ar/congreso_explicado/',
  constitution: 'https://www.argentina.gob.ar/sites/default/files/constitucion-nacional-argentina.pdf',
  dictamens: 'https://www.hcdn.gob.ar/secparl/dgral_info_parlamentaria/reglamentos/glosario/D/dictamen-comision.html',
  labor: 'https://www.hcdn.gob.ar/secparl/dgral_info_parlamentaria/detalle/Plan-de-Labor-y-Orden-del-Dia/',
};

const OFFICIAL_TERMS = [
  ['Comisión de Labor Parlamentaria', OFFICIAL_SOURCES.labor],
  ['plan de labor parlamentaria', OFFICIAL_SOURCES.labor],
  ['cámara de origen', OFFICIAL_SOURCES.chambers],
  ['cámara revisora', OFFICIAL_SOURCES.chambers],
  ['ambas cámaras', OFFICIAL_SOURCES.constitution],
  ['Poder Ejecutivo', OFFICIAL_SOURCES.constitution],
  ['Boletín Oficial', OFFICIAL_SOURCES.bulletin],
  ['comisiones', OFFICIAL_SOURCES.congress],
  ['dictámenes', OFFICIAL_SOURCES.dictamens],
  ['dictamen', OFFICIAL_SOURCES.dictamens],
  ['estado parlamentario', OFFICIAL_SOURCES.congress],
  ['promulgación', OFFICIAL_SOURCES.constitution],
  ['veto', OFFICIAL_SOURCES.constitution],
  ['Congreso', OFFICIAL_SOURCES.congress],
];

function OfficialLink({ children, href }) {
  return (
    <a
      className={styles.officialLink}
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      title="Consultar fuente oficial"
    >
      {children}
    </a>
  );
}

function OfficialText({ children }) {
  if (typeof children !== 'string') return children;

  const terms = OFFICIAL_TERMS.map(([term]) => term)
    .sort((first, second) => second.length - first.length);
  const escapedTerms = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const matcher = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
  const usedTerms = new Set();

  return children.split(matcher).map((part, index) => {
    const source = OFFICIAL_TERMS.find(([term]) => (
      term.toLocaleLowerCase('es') === part.toLocaleLowerCase('es')
    ));

    if (!source || usedTerms.has(source[0])) return part;
    usedTerms.add(source[0]);

    return (
      <OfficialLink href={source[1]} key={`${part}-${index}`}>
        {part}
      </OfficialLink>
    );
  });
}

const STAGES = [
  {
    number: '01',
    icon: 'move_to_inbox',
    shortTitle: 'Ingreso',
    title: 'Se presenta en mesa de entradas',
    lead: 'Es una oficina técnica que depende de la secretaría parlamentaria.',
    body: [
      'Su función es estudiar el proyecto y de acuerdo con el tema, derivarlo a las comisiones que correspondan.',
      'Se le asigna un número de expediente que muestra la cantidad de proyectos presentados en el año.',
    ],
    highlight: {
      label: 'Estado parlamentario',
      text: 'Ahí el proyecto toma estado parlamentario.',
    },
  },
  {
    number: '02',
    icon: 'account_tree',
    shortTitle: 'Comisiones',
    title: 'Se le asignan comisiones',
    lead: 'Cuantas más comisiones se le otorgan a un proyecto, más se va a demorar en salir porque se tiene que aprobar en cada una.',
    body: [
      'Generalmente se designan de dos a cinco comisiones, aunque cinco es una cantidad importante. Acá juega lo político: si no quieren tratarlo, lo derivan a muchas comisiones a modo de trabas.',
      'Generalmente, todos los proyectos son derivados como mínimo a la comisión de legislación general. Tiene importancia política y se integra por actores de relevancia. Actúa como primer filtro.',
    ],
    highlight: {
      label: 'Acá juega lo político',
      text: 'Si no quieren tratarlo, lo derivan a muchas comisiones a modo de trabas.',
    },
  },
  {
    number: '03',
    icon: 'groups',
    shortTitle: 'Dictamen',
    title: 'Se trata en comisiones',
    lead: 'Si es una urgencia puede saltearse. Se analiza el proyecto de forma técnica.',
    body: [
      'Intervienen los asesores con su aporte técnico y los legisladores con lo político.',
      'Cuando el proyecto fue girado a varias comisiones, se puede convocar un plenario de comisiones donde trabajan todas en forma conjunta.',
      'Ya sea de forma individual en cada comisión, o en plenario, el proyecto debe ser tratado por todas las comisiones. Cuando se llega a una decisión, hay dictamen. Puede haber más de un dictamen.',
    ],
    dictamens: [
      ['Por unanimidad', 'Todos los legisladores están de acuerdo con la decisión final.'],
      ['De mayoría', 'Hay opiniones distintas, pero el dictamen de mayoría es el que más adhesiones tiene. Si hay empate, el dictamen de mayoría es el que tiene la firma del presidente de la comisión. El dictamen de mayoría es el que más importancia va a tener a la hora de tratarlo en el recinto.'],
      ['De minoría', 'Hay opiniones distintas y el dictamen de minoría (puede haber más de uno) es el que menos adhesiones tuvo.'],
      ['En minoría', 'Se convocó dos o más veces a las comisiones, pero no se alcanzó la mayoría necesaria para aprobarlo.'],
    ],
    highlight: {
      label: 'Dictamen',
      text: 'Cuando se llega a una decisión, hay dictamen. Puede haber más de un dictamen.',
    },
  },
  {
    number: '04',
    icon: 'event_note',
    shortTitle: 'Agenda',
    title: 'Comisión de labor parlamentaria',
    lead: 'Una vez que se trata de las comisiones, el proyecto se gira a esta comisión.',
    body: [
      'Es como las demás, pero está formada por el presidente de la cámara, los vicepresidentes y los presidentes de todos los bloques.',
      'Reciben el dictamen y evalúan si incluirlo en el debate de la sesión o no.',
      'Por lo general esta reunión se realiza horas antes a comenzar una sesión.',
      'Si se decide incluirlo, se pone en el plan de labor parlamentaria: día, hora, temas a tratar. Aquí los miembros de la comisión negocian qué dictamen tratar.',
    ],
    highlight: {
      label: 'Plan de labor parlamentaria',
      text: 'Día, hora, temas a tratar. Aquí los miembros de la comisión negocian qué dictamen tratar.',
    },
  },
  {
    number: '05',
    icon: 'podium',
    shortTitle: 'Origen',
    title: 'Se debate en el recinto de la cámara de origen',
    lead: 'Cuando el proyecto fue girando de comisión en comisión, se le fue agregando modificaciones que van a quedar plasmadas en los dictámenes que se voten.',
    body: [
      'Por eso, lo que se discute en el recinto es más el dictamen que el proyecto.',
    ],
  },
  {
    number: '06',
    icon: 'how_to_vote',
    shortTitle: 'Revisión',
    title: 'Se aprueba y comienza el mismo ciclo en la cámara revisora',
    lead: 'Si ambas cámaras aprueban, pasa al ejecutivo.',
    body: [
      'Se aprueba y comienza el mismo ciclo en la cámara revisora. Si ambas cámaras aprueban, pasa al ejecutivo.',
    ],
  },
];

const LAW_SCENARIOS = [
  {
    tone: 'success',
    origin: 'Aprueba',
    review: 'Aprueba',
    result: 'Ley sancionada',
    icon: 'verified',
  },
  {
    tone: 'stop',
    origin: 'Aprueba',
    review: 'Rechaza',
    result: 'No se puede tratar por 1 año',
    icon: 'block',
  },
  {
    tone: 'stop',
    origin: 'Rechaza',
    review: 'No pasa a cámara revisora',
    result: 'No se puede tratar por 1 año',
    icon: 'do_not_disturb_on',
  },
  {
    tone: 'change',
    origin: 'Aprueba',
    review: 'Adiciona o corrige',
    result: 'Vuelve a cámara de origen y si se aprueba, se sanciona. Vuelve a cámara de origen, pero esta insiste con el proyecto original. Para que quede el original, debe aprobarlo con la mayoría que utilizó la revisora para corregirlo.',
    icon: 'sync_alt',
  },
];

const EXECUTIVE_ACTIONS = [
  ['task_alt', 'Aprueba por decreto.', ''],
  ['schedule', 'Aprobación tácita', 'Si pasan 10 días sin que el presidente se expida acerca del proyecto. Se publica en el Boletín Oficial para que entre en vigencia.'],
  ['cancel', 'Vetar ley total', 'Anula la ley completamente.'],
  ['rule', 'Vetar ley parcialmente', 'Anula una parte que no afecte el espíritu de la ley. Si se excede es veto total.'],
];

const VETO_SCENARIOS = [
  {
    chambers: ['Confirma ley con ⅔ e insiste', 'Confirma ley con ⅔'],
    result: 'Se promulga',
    tone: 'success',
  },
  {
    chambers: ['No confirma con ⅔', 'No se trata este año'],
    result: 'Se mantiene el veto',
    tone: 'stop',
  },
  {
    chambers: ['Confirma ley con ⅔', 'No llega a ⅔'],
    result: 'Se mantiene el veto',
    tone: 'stop',
  },
];

const BULLETIN_SECTIONS = [
  ['gavel', 'Legislación y avisos oficiales', 'Promulgación de leyes, decretos, resoluciones.', OFFICIAL_SOURCES.bulletinFirst],
  ['domain', 'Sociedades y avisos judiciales', 'Notificaciones de sociedades anónimas, etc.', OFFICIAL_SOURCES.bulletinSecond],
  ['contract', 'Contrataciones', 'Contrataciones del Estado con sus proveedores.', OFFICIAL_SOURCES.bulletinThird],
  ['language', 'Dominios de internet', 'Nuevos dominios que se dan de alta.', OFFICIAL_SOURCES.bulletinFourth],
];

const GLOSSARY = [
  ['Número de expediente', 'Muestra la cantidad de proyectos presentados en el año.', OFFICIAL_SOURCES.congress],
  ['Estado parlamentario', 'Ahí el proyecto toma estado parlamentario.', OFFICIAL_SOURCES.congress],
  ['Dictamen', 'Cuando se llega a una decisión, hay dictamen. Puede haber más de un dictamen.', OFFICIAL_SOURCES.dictamens],
  ['Plan de labor parlamentaria', 'Día, hora, temas a tratar. Aquí los miembros de la comisión negocian qué dictamen tratar.', OFFICIAL_SOURCES.labor],
  ['Aprobación tácita', 'Si pasan 10 días sin que el presidente se expida acerca del proyecto.', OFFICIAL_SOURCES.constitution],
  ['Vetar ley total', 'Anula la ley completamente.', OFFICIAL_SOURCES.constitution],
  ['Vetar ley parcialmente', 'Anula una parte que no afecte el espíritu de la ley. Si se excede es veto total.', OFFICIAL_SOURCES.constitution],
];

function StageCard({ stage, isOpen, onToggle, cardRef }) {
  return (
    <article
      className={`${styles.stageCard}${isOpen ? ` ${styles.stageCardOpen}` : ''}`}
      id={`etapa-${stage.number}`}
      ref={cardRef}
    >
      <button
        aria-expanded={isOpen}
        className={styles.stageButton}
        onClick={onToggle}
        type="button"
      >
        <span className={styles.stageNumber}>{stage.number}</span>
        <span className={`${styles.stageIcon} material-symbols-outlined`} aria-hidden="true">
          {stage.icon}
        </span>
        <span className={styles.stageHeading}>
          <small>Etapa {Number(stage.number)}</small>
          <strong>{stage.title}</strong>
          <span>{stage.lead}</span>
        </span>
        <span className={`${styles.chevron} material-symbols-outlined`} aria-hidden="true">
          expand_more
        </span>
      </button>

      {isOpen && (
        <div className={styles.stageBody}>
          <div className={styles.stageCopy}>
            {stage.body.map((paragraph) => (
              <p key={paragraph}><OfficialText>{paragraph}</OfficialText></p>
            ))}
          </div>

          {stage.dictamens && (
            <div className={styles.dictamenGrid}>
              {stage.dictamens.map(([title, text]) => (
                <div key={title}>
                  <strong><OfficialLink href={OFFICIAL_SOURCES.dictamens}>{title}</OfficialLink></strong>
                  <p><OfficialText>{text}</OfficialText></p>
                </div>
              ))}
            </div>
          )}

          {stage.highlight && (
            <aside className={styles.stageHighlight}>
              <span className="material-symbols-outlined" aria-hidden="true">lightbulb</span>
              <div>
                <strong>{stage.highlight.label}</strong>
                <p><OfficialText>{stage.highlight.text}</OfficialText></p>
              </div>
            </aside>
          )}
        </div>
      )}
    </article>
  );
}

function GlossaryModal({ onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div className={styles.modalOverlay} onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="glossary-title"
        aria-modal="true"
        className={styles.modal}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className={styles.modalHeader}>
          <div>
            <span>Conceptos clave</span>
            <h2 id="glossary-title">Glosario legislativo</h2>
          </div>
          <button ref={closeRef} aria-label="Cerrar glosario" onClick={onClose} type="button">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>

        <div className={styles.glossaryList}>
          {GLOSSARY.map(([term, definition, href]) => (
            <article key={term}>
              <h3><OfficialLink href={href}>{term}</OfficialLink></h3>
              <p><OfficialText>{definition}</OfficialText></p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function LegislativePath() {
  const [openStages, setOpenStages] = useState(() => new Set(['01']));
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const stageRefs = useRef({});

  const toggleStage = (number) => {
    setOpenStages((current) => {
      const next = new Set(current);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  const goToStage = (number) => {
    setOpenStages((current) => new Set(current).add(number));
    window.requestAnimationFrame(() => {
      stageRefs.current[number]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <main className={styles.page} id="contenido">
      <section className={styles.hero}>
        <div className={`shell ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <span className="eyebrow">App Politeia 2026</span>
            <h1>El camino de la ley</h1>
            <p>
              ¡Hola! En este documento, detallamos cada una de las etapas que atraviesa
              un proyecto en el Congreso, desde su presentación inicial hasta su sanción
              definitiva, promulgación o rechazo. Ya que entender cómo se debate y se
              aprueba una ley es el primer paso para analizar la política de manera profunda.
            </p>
            <div className={styles.heroActions}>
              <button className="button primary" onClick={() => goToStage('01')} type="button">
                Empezar el recorrido
                <span className="material-symbols-outlined" aria-hidden="true">arrow_downward</span>
              </button>
              <button className="button ghost" onClick={() => setGlossaryOpen(true)} type="button">
                <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
                Abrir glosario
              </button>
            </div>
          </div>

          <div className={styles.heroDiagram} aria-label="Resumen del recorrido legislativo">
            <div className={styles.diagramTrack} aria-hidden="true" />
            {[
              ['description', 'Proyecto'],
              ['account_balance', 'Congreso'],
              ['verified', 'Ley'],
            ].map(([icon, label], index) => (
              <div className={styles.diagramNode} key={label}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <i className="material-symbols-outlined" aria-hidden="true">{icon}</i>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className={`shell ${styles.heroFacts}`}>
          <div><strong>6</strong><span>etapas del proceso inicial</span></div>
          <div><strong>2</strong><span>cámaras</span></div>
          <div><strong>10</strong><span>días sin que el presidente se expida</span></div>
        </div>
      </section>

      <nav className={styles.stageNav} aria-label="Etapas del proceso legislativo">
        <div className="shell">
          <div className={styles.stageNavInner}>
            {STAGES.map((stage) => (
              <button key={stage.number} onClick={() => goToStage(stage.number)} type="button">
                <span>{stage.number}</span>
                {stage.shortTitle}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <section className={styles.processSection}>
        <div className="shell">
          <header className={styles.sectionHead}>
            <div>
              <span className="eyebrow">Proceso inicial</span>
              <h2>Proceso inicial</h2>
            </div>
            <p>
              <OfficialText>
                En este documento, detallamos cada una de las etapas que atraviesa un proyecto en el Congreso.
              </OfficialText>
            </p>
          </header>

          <div className={styles.stageList}>
            {STAGES.map((stage) => (
              <StageCard
                key={stage.number}
                cardRef={(element) => { stageRefs.current[stage.number] = element; }}
                isOpen={openStages.has(stage.number)}
                onToggle={() => toggleStage(stage.number)}
                stage={stage}
              />
            ))}
          </div>

        </div>
      </section>

      <section className={styles.chambersSection}>
        <div className="shell">
          <header className={styles.sectionHead}>
            <div>
              <span className="eyebrow">Cámara de origen y cámara revisora</span>
              <h2>En el proceso de una ley hay cuatro escenarios posibles</h2>
            </div>
            <p>
              <OfficialText>
                El resultado depende de lo que decidan la cámara de origen y la cámara revisora. Cada combinación define cómo continúa el proyecto.
              </OfficialText>
            </p>
          </header>

          <div className={styles.scenarioGrid}>
            {LAW_SCENARIOS.map((scenario) => (
              <article className={`${styles.scenario} ${styles[scenario.tone]}`} key={`${scenario.origin}-${scenario.review}`}>
                <span className={`${styles.scenarioIcon} material-symbols-outlined`} aria-hidden="true">
                  {scenario.icon}
                </span>
                <div className={styles.scenarioFlow}>
                  <span><small>Origen</small><strong>{scenario.origin}</strong></span>
                  <i className="material-symbols-outlined" aria-hidden="true">arrow_forward</i>
                  <span><small>Revisora</small><strong>{scenario.review}</strong></span>
                </div>
                <div className={styles.scenarioResult}>
                  <small>Resultado</small>
                  <p>
                    <OfficialLink href={OFFICIAL_SOURCES.chambers}>
                      {scenario.result}
                    </OfficialLink>
                  </p>
                </div>
              </article>
            ))}
          </div>

        </div>
      </section>

      <section className={styles.executiveSection}>
        <div className={`shell ${styles.executiveGrid}`}>
          <div className={styles.executiveIntro}>
            <span className="eyebrow">Poder Ejecutivo</span>
            <h2>Una vez que se aprueba en ambas cámaras, pasa al Poder Ejecutivo</h2>
            <p>
              <OfficialText>
                El Poder Ejecutivo puede aprobar la ley o vetarla. Estas son las cuatro posibilidades que completan el recorrido.
              </OfficialText>
            </p>
          </div>

          <div className={styles.executiveActions}>
            {EXECUTIVE_ACTIONS.map(([icon, title, text], index) => (
              <article
                className={index < 2 ? styles.executiveApprove : styles.executiveVeto}
                key={title}
              >
                <span className={`${styles.executiveActionIcon} material-symbols-outlined`} aria-hidden="true">{icon}</span>
                <div>
                  <small>{index < 2 ? 'Aprobación' : 'Veto'}</small>
                  <h3>
                    <OfficialLink href={OFFICIAL_SOURCES.constitution}>{title}</OfficialLink>
                  </h3>
                  {text && <p><OfficialText>{text}</OfficialText></p>}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className={`shell ${styles.vetoWrap}`}>
          <header>
            <span>Veto del ejecutivo</span>
            <h3>Hay 3 escenarios en cuanto al veto del ejecutivo</h3>
            <p>
              <OfficialText>
                La respuesta de ambas cámaras determina si la ley se promulga o si se mantiene el veto.
              </OfficialText>
            </p>
          </header>
          <div className={styles.vetoGrid}>
            {VETO_SCENARIOS.map((scenario) => (
              <article className={styles[scenario.tone]} key={scenario.chambers.join('-')}>
                <span><small>Poder Ejecutivo</small>Veta</span>
                {scenario.chambers.map((text, index) => (
                  <span key={text}><small>{index === 0 ? 'Origen' : 'Revisora'}</small>{text}</span>
                ))}
                <div className={styles.vetoResult}>
                  <small>Resultado</small>
                  <strong>
                    <OfficialLink href={OFFICIAL_SOURCES.constitution}>
                      {scenario.result}
                    </OfficialLink>
                  </strong>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.bulletinSection}>
        <div className="shell">
          <header className={styles.bulletinHeader}>
            <div>
              <span className="eyebrow">Boletín Oficial</span>
              <h2>
                <OfficialLink href={OFFICIAL_SOURCES.bulletin}>El Boletín Oficial</OfficialLink>
              </h2>
            </div>
            <p>
              <OfficialText>
                Es donde se publica todo lo que se presume que tiene que ser conocido por la población. Tiene cuatro partes.
              </OfficialText>
            </p>
          </header>
          <div className={styles.bulletinGrid}>
            {BULLETIN_SECTIONS.map(([icon, title, text, href], index) => (
              <article key={title}>
                <span className={styles.bulletinNumber}>0{index + 1}</span>
                <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
                <h3><OfficialLink href={href}>{title}</OfficialLink></h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.closingSection}>
        <div className={`shell ${styles.closingInner}`}>
          <span className="material-symbols-outlined" aria-hidden="true">route</span>
          <div>
            <span>El camino de la ley</span>
            <h2>¡Gracias por leer!</h2>
          </div>
          <button className="button ghost" onClick={() => setGlossaryOpen(true)} type="button">
            Repasar conceptos
          </button>
        </div>
      </section>

      {glossaryOpen && <GlossaryModal onClose={() => setGlossaryOpen(false)} />}
    </main>
  );
}
